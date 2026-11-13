import json
import random
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from backend.bptree import BPlusTree
from backend.cache import HashTable, MiniRedis
from backend.database import Database
from backend.server import Application, PoolServer
from backend.sql import parse


class HashTests(unittest.TestCase):
    def test_collisions_resize_update_delete(self):
        table = HashTable(4)
        keys = [str(i) for i in range(500)]
        for i, key in enumerate(keys):
            table.set(key, i)
        self.assertGreater(len(table.buckets), 4)
        self.assertEqual(table.size, 500)
        for i, key in enumerate(keys):
            self.assertEqual(table.get(key), i)
        table.set('1', 99)
        self.assertEqual(table.get('1'), 99)
        self.assertEqual(table.size, 500)
        self.assertTrue(table.delete('1'))
        self.assertFalse(table.delete('1'))
        self.assertEqual(table.size, 499)

    def test_same_bucket_collision_preserves_neighbors(self):
        table = HashTable(32)
        keys = [str(i) for i in range(1000) if table.slot(str(i)) == 0][:3]
        for key in keys:
            table.set(key, key)
        table.delete(keys[1])
        self.assertEqual(table.get(keys[0]), keys[0])
        self.assertEqual(table.get(keys[2]), keys[2])

    def test_expiry_boundary_null_and_mutation_isolation(self):
        clock = [100.0]
        cache = MiniRedis(lambda: clock[0])
        value = {'items': [1]}
        cache.set('한글', value, 2)
        value['items'].append(2)
        read = cache.get('한글')
        self.assertEqual(read['value'], {'items': [1]})
        read['value']['items'].append(3)
        self.assertEqual(cache.get('한글')['value'], {'items': [1]})
        clock[0] = 102
        self.assertFalse(cache.get('한글')['found'])
        cache.set('null', None)
        self.assertEqual(cache.get('null'), {'found': True, 'value': None})
        cache.set('now', 1, 0)
        self.assertFalse(cache.get('now')['found'])

    def test_ttl_replacement_and_sweep(self):
        clock = [0]
        cache = MiniRedis(lambda: clock[0])
        cache.set('x', 1, 1)
        cache.set('x', 2)
        cache.set('y', 3, 1)
        clock[0] = 2
        self.assertEqual(cache.sweep(), 1)
        self.assertEqual(cache.get('x')['value'], 2)

    def test_invalid_ttl_and_key(self):
        cache = MiniRedis()
        for ttl in (-1, float('nan'), float('inf'), '1', True):
            with self.subTest(ttl=ttl), self.assertRaises(ValueError):
                cache.set('x', 1, ttl)
        with self.assertRaises(ValueError):
            cache.set('', 1)

    def test_snapshot_absolute_ttl(self):
        clock = [10]
        cache = MiniRedis(lambda: clock[0])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'snapshot.json'
            cache.set('permanent', {'v': 1})
            cache.set('expires', 1, 1)
            cache.snapshot(path)
            clock[0] = 12
            restored = MiniRedis(lambda: clock[0])
            restored.restore(path)
            self.assertFalse(restored.get('expires')['found'])
            self.assertEqual(restored.get('permanent')['value'], {'v': 1})

    def test_concurrent_writes(self):
        cache = MiniRedis()
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda i: cache.set(str(i), i), range(2000)))
        self.assertEqual(cache.stats()['keys'], 2000)
        for i in range(2000):
            self.assertEqual(cache.get(str(i))['value'], i)


class TreeTests(unittest.TestCase):
    def test_random_splits_and_invariants(self):
        for order in (3, 4, 8, 64):
            tree = BPlusTree(order)
            keys = list(range(2000))
            random.Random(7).shuffle(keys)
            for key in keys:
                tree.insert(key, key * 10)
            depths = set()

            def check(node, depth=0):
                self.assertEqual(node.keys, sorted(node.keys))
                self.assertLess(len(node.keys), order)
                if node.leaf:
                    depths.add(depth)
                    self.assertEqual(len(node.keys), len(node.values))
                    return node.keys[0], node.keys[-1]
                self.assertEqual(len(node.children), len(node.keys) + 1)
                bounds = [check(child, depth + 1) for child in node.children]
                for i, separator in enumerate(node.keys):
                    self.assertLess(bounds[i][1], separator)
                    self.assertEqual(bounds[i + 1][0], separator)
                return bounds[0][0], bounds[-1][1]

            check(tree.root)
            self.assertEqual(len(depths), 1)
            self.assertEqual(list(tree.items()), [(k, k * 10) for k in range(2000)])
            self.assertEqual(list(tree.items(13, 21)), [(k, k * 10) for k in range(13, 22)])
            for key in keys:
                self.assertEqual(tree.lookup(key)[0], key * 10)
            tree.insert(99, 123)
            self.assertEqual(tree.lookup(99)[0], 123)
            self.assertEqual(tree.size, 2000)
            self.assertIsNone(tree.lookup(9999)[0])


class SQLTests(unittest.TestCase):
    def test_escaped_quotes_comments_and_semicolons(self):
        parsed = parse("-- demo\nINSERT INTO scores (name, attempts, pairs) VALUES ('O''Brien; 한글', 4, 2); SELECT name FROM scores WHERE id = 1 LIMIT 1;")
        self.assertEqual(parsed[0]['values']['name'], "O'Brien; 한글")
        self.assertEqual(parsed[1]['where'], ('id', 1))

    def test_reject_invalid_grammar(self):
        for sql in ('', 'DELETE FROM scores', 'SELECT * FROM ../scores', 'SELECT * FROM scores garbage',
                    'SELECT * FROM scores LIMIT -1', "SELECT * FROM scores WHERE name = 'unfinished",
                    "INSERT INTO scores (name,name) VALUES ('a','b')", 'SELECT * FROM scores LIMIT 1001'):
            with self.subTest(sql=sql), self.assertRaises(ValueError):
                parse(sql)


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Database(self.temp.name)

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def test_insert_select_plans_restart_and_byte_offsets(self):
        self.db.execute("INSERT INTO scores (name, attempts, pairs) VALUES ('한글 😀', 9, 8)")
        self.db.execute("INSERT INTO scores (name, attempts, pairs) VALUES ('second', 10, 8)")
        result = self.db.execute('SELECT * FROM scores WHERE id = 2')[0]
        self.assertEqual(result['rows'][0]['name'], 'second')
        self.assertEqual(result['plan'], 'B+TREE')
        self.assertEqual(result['rows_examined'], 1)
        scan = self.db.execute("SELECT name FROM scores WHERE name = 'second'")[0]
        self.assertEqual(scan['plan'], 'FULL_SCAN')
        self.assertEqual(scan['rows_examined'], 2)
        self.db.close()
        self.db = Database(self.temp.name)
        self.assertEqual(self.db.execute('SELECT * FROM scores WHERE id = 2')[0]['rows'], result['rows'])
        row = self.db.execute("INSERT INTO scores (name, attempts, pairs) VALUES ('third', 10, 8)")[0]['row']
        self.assertEqual(row['id'], 3)

    def test_reject_wrong_schema_and_types(self):
        for sql in ("INSERT INTO scores (id,name,attempts,pairs) VALUES (1,'a',1,1)",
                    "INSERT INTO scores (name,attempts,pairs) VALUES ('a','1',1)",
                    "INSERT INTO scores (name,attempts,pairs) VALUES ('a',1,8)",
                    'SELECT missing FROM scores', "SELECT * FROM scores WHERE id = '1'", 'SELECT * FROM missing'):
            with self.subTest(sql=sql), self.assertRaises(ValueError):
                self.db.execute(sql)

    def test_recover_only_incomplete_tail(self):
        self.db.execute("INSERT INTO products (name,price) VALUES ('one',1)")
        self.db.close()
        path = Path(self.temp.name) / 'products.jsonl'
        with path.open('ab') as stream:
            stream.write(b'{"id":2')
        self.db = Database(self.temp.name)
        self.assertEqual(self.db.tables['products'].next_id, 2)
        self.assertTrue(path.read_bytes().endswith(b'\n'))

    def test_single_process_ownership(self):
        with self.assertRaises(RuntimeError):
            Database(self.temp.name)

    def test_complete_corruption_is_not_silently_discarded(self):
        self.db.close()
        path = Path(self.temp.name) / 'products.jsonl'
        path.write_bytes(b'broken complete record\n')
        with self.assertRaises(ValueError):
            Database(self.temp.name)
        self.assertEqual(path.read_bytes(), b'broken complete record\n')

    def test_parallel_inserts_unique_ids_and_file_index_consistency(self):
        def insert(i):
            return self.db.execute(f"INSERT INTO products (name,price) VALUES ('p{i}',{i})")[0]['row']['id']
        with ThreadPoolExecutor(max_workers=8) as pool:
            ids = list(pool.map(insert, range(120)))
        self.assertEqual(sorted(ids), list(range(1, 121)))
        self.assertEqual(self.db.tables['products'].index.size, 120)
        for key in ids:
            self.assertEqual(self.db.execute(f'SELECT * FROM products WHERE id = {key}')[0]['rows'][0]['id'], key)

    def test_bulk_and_sql_share_index(self):
        self.db.tables['products'].bulk({'name': f'p{i}', 'price': i} for i in range(10001))
        result = self.db.execute('SELECT * FROM products WHERE id = 10001')[0]
        self.assertEqual(result['rows'][0]['price'], 10000)
        self.assertEqual(result['rows_examined'], 1)


class APITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = Application(self.temp.name)
        self.server = PoolServer(('127.0.0.1', 0), self.app, workers=4)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.app.close()
        self.temp.cleanup()

    def request(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        request = Request(self.url + path, data=data, method=method, headers={'Content-Type': 'application/json'})
        with urlopen(request, timeout=10) as response:
            return json.load(response)

    def test_cache_aside_and_invalidation(self):
        self.assertEqual(self.request('GET', '/api/scores')['cache'], 'MISS')
        self.assertEqual(self.request('GET', '/api/scores')['cache'], 'HIT')
        self.request('POST', '/api/scores', {'name': 'player', 'attempts': 9, 'pairs': 8})
        response = self.request('GET', '/api/scores')
        self.assertEqual(response['cache'], 'MISS')
        self.assertEqual(len(response['rows']), 1)
        hit = self.request('GET', '/api/scores')
        self.assertEqual(hit['rows_examined'], 0)
        self.assertEqual(hit['plan'], 'HASH_LOOKUP')
        self.assertEqual(self.request('GET', '/api/scores?cache=0')['cache'], 'BYPASS')
        self.request('POST', '/api/sql', {'sql': "INSERT INTO scores (name,attempts,pairs) VALUES ('sql',10,8)"})
        self.assertEqual(self.request('GET', '/api/scores')['cache'], 'MISS')
        self.assertTrue(self.request('DELETE', '/api/cache/scores')['deleted'])

    def test_kv_snapshot_invalid_json_and_unknown_routes(self):
        self.request('PUT', '/api/kv/example', {'value': None, 'ttl': 30})
        self.assertTrue(self.request('GET', '/api/kv/example')['found'])
        self.assertTrue(self.request('POST', '/api/cache/snapshot')['saved'])
        self.assertTrue(self.request('DELETE', '/api/kv/example')['deleted'])
        self.assertFalse(self.request('GET', '/api/kv/example')['found'])
        for path, body, code in (('/api/sql', {'sql': 'DROP TABLE scores'}, 400),
                                 ('/api/sql', {'sql': 'SELECT * FROM scores; SELECT * FROM scores'}, 400),
                                 ('/api/unknown', {}, 404), ('/api/scores', {'name': 'bad'}, 400)):
            with self.subTest(path=path), self.assertRaises(HTTPError) as error:
                self.request('POST', path, body)
            self.assertEqual(error.exception.code, code)
            error.exception.close()

    def test_parallel_http_requests_use_pool_and_unique_ids(self):
        def save(i):
            return self.request('POST', '/api/scores', {'name': f'user{i}', 'attempts': 12, 'pairs': 8})
        with ThreadPoolExecutor(max_workers=8) as pool:
            responses = list(pool.map(save, range(40)))
        self.assertEqual(sorted(r['row']['id'] for r in responses), list(range(1, 41)))
        self.assertGreater(len({r['worker'] for r in responses}), 1)
        self.assertLessEqual(len({r['worker'] for r in responses}), 4)

    def test_concurrent_reads_do_not_leave_stale_cache(self):
        def action(i):
            if i % 2:
                return self.request('POST', '/api/scores', {'name': f'p{i}', 'attempts': 8, 'pairs': 8})
            return self.request('GET', '/api/scores')
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(action, range(40)))
        self.assertEqual(len(self.request('GET', '/api/scores')['rows']), 20)

    def test_api_expiry_and_validation(self):
        clock = [100]
        self.app.cache.clock = lambda: clock[0]
        self.request('PUT', '/api/kv/expiring', {'value': 42, 'ttl': 2})
        self.assertTrue(self.request('GET', '/api/kv/expiring')['found'])
        clock[0] = 102
        self.assertFalse(self.request('GET', '/api/kv/expiring')['found'])
        with self.assertRaises(HTTPError) as error:
            self.request('PUT', '/api/kv/expiring', {'value': 42, 'ttl': -1})
        self.assertEqual(error.exception.code, 400)
        error.exception.close()

    def test_pool_returns_503_when_capacity_is_full(self):
        entered, release = threading.Event(), threading.Event()
        class BlockingApp:
            def dispatch(self, *_):
                entered.set()
                release.wait(5)
                return {'ok': True}
        with PoolServer(('127.0.0.1', 0), BlockingApp(), workers=1, queue_size=0) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            url = f'http://127.0.0.1:{server.server_port}/api/health'
            def get():
                with urlopen(url, timeout=10) as response:
                    return json.load(response)
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(get)
                try:
                    self.assertTrue(entered.wait(3))
                    with self.assertRaises(HTTPError) as error:
                        get()
                    self.assertEqual(error.exception.code, 503)
                    error.exception.close()
                finally:
                    release.set()
                    server.shutdown()
                    thread.join()
                self.assertTrue(future.result()['ok'])


if __name__ == '__main__':
    unittest.main()
