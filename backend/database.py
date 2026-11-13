"""Append-only JSONL tables, fsync, restart index rebuild and per-table locks."""
import json
import os
import threading
import time
from pathlib import Path
from .bptree import BPlusTree
from .sql import parse

SCHEMAS = {'scores': {'name': str, 'attempts': int, 'pairs': int},
           'products': {'name': str, 'price': int}}


class DirectoryLock:
    """Keep a CLI process and server from writing the same directory concurrently."""
    def __init__(self, directory):
        self.stream = (directory / '.engine.lock').open('a+b')
        self.stream.write(b'0')
        self.stream.flush()
        self.stream.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(self.stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            self.stream.close()
            raise RuntimeError('Data directory is in use. Stop the other server/CLI or choose --data.') from error

    def close(self):
        if not self.stream.closed:
            if os.name == 'nt':
                import msvcrt
                self.stream.seek(0)
                msvcrt.locking(self.stream.fileno(), msvcrt.LK_UNLCK, 1)
            self.stream.close()


class Table:
    def __init__(self, path, schema):
        self.path, self.schema = path, schema
        self.lock = threading.RLock()
        self.index = BPlusTree()
        self.next_id = 1
        path.touch(exist_ok=True)
        with path.open('r+b') as stream:
            while True:
                offset = stream.tell()
                line = stream.readline()
                if not line:
                    break
                # An interrupted final append is discarded. Corruption of a complete record fails loudly.
                if not line.endswith(b'\n'):
                    stream.truncate(offset)
                    break
                row = json.loads(line)
                if type(row.get('id')) is not int or row['id'] != self.next_id:
                    raise ValueError(f'Invalid record ID in {path.name} at byte {offset}')
                self.validate({k: v for k, v in row.items() if k != 'id'})
                self.index.insert(row['id'], offset)
                self.next_id += 1

    def validate(self, values):
        if set(values) != set(self.schema):
            raise ValueError(f'Required columns: {", ".join(self.schema)}; id is automatic')
        for key, kind in self.schema.items():
            value = values[key]
            if type(value) is not kind:
                raise ValueError(f'{key} must be {kind.__name__}')
            if kind is str and not 1 <= len(value) <= 200:
                raise ValueError(f'{key} must contain 1 to 200 characters')
            if kind is int and not 0 <= value <= 2147483647:
                raise ValueError(f'{key} must be between 0 and 2147483647')
        if 'pairs' in values and (values['pairs'] > 8 or values['attempts'] < values['pairs']):
            raise ValueError('pairs must be 0..8 and attempts must be at least pairs')

    def append(self, values):
        self.validate(values)
        with self.lock:
            row = {'id': self.next_id, **values}
            encoded = (json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
            with self.path.open('ab') as stream:
                offset = stream.tell()
                try:
                    stream.write(encoded)
                    stream.flush()
                    os.fsync(stream.fileno())
                except OSError:
                    stream.truncate(offset)
                    raise
            self.index.insert(row['id'], offset)
            self.next_id += 1
            return row

    def bulk(self, rows):
        """Benchmark loader; same append format/index, fsync once per batch of <=10000."""
        count = 0
        iterator = iter(rows)
        while True:
            batch = []
            for _ in range(10000):
                try:
                    row = next(iterator)
                except StopIteration:
                    break
                self.validate(row)
                batch.append(row)
            if not batch:
                return count
            with self.lock:
                with self.path.open('ab') as stream:
                    start = stream.tell()
                    offsets = []
                    try:
                        for number, values in enumerate(batch, self.next_id):
                            offsets.append((number, stream.tell()))
                            stream.write((json.dumps({'id': number, **values}, separators=(',', ':')) + '\n').encode())
                        stream.flush()
                        os.fsync(stream.fileno())
                    except OSError:
                        stream.truncate(start)
                        raise
                for number, offset in offsets:
                    self.index.insert(number, offset)
                self.next_id += len(batch)
                count += len(batch)

    def select(self, columns, where, limit):
        allowed = {'id': int, **self.schema}
        if columns != ['*'] and any(column not in allowed for column in columns):
            raise ValueError('Unknown selected column')
        if where and (where[0] not in allowed or type(where[1]) is not allowed[where[0]]):
            raise ValueError('Unknown WHERE column or wrong literal type')
        rows, examined, visited = [], 0, 0
        indexed = where is not None and where[0] == 'id'
        with self.lock, self.path.open('rb') as stream:
            if indexed:
                offset, visited = self.index.lookup(where[1])
                if offset is not None:
                    stream.seek(offset)
                    rows.append(json.loads(stream.readline()))
                    examined = 1
            else:
                for line in stream:
                    row = json.loads(line)
                    examined += 1
                    if where is None or row[where[0]] == where[1]:
                        rows.append(row)
                        if len(rows) >= limit:
                            break
        if columns != ['*']:
            rows = [{key: row[key] for key in columns} for row in rows]
        return {'rows': rows, 'plan': 'B+TREE' if indexed else 'FULL_SCAN',
                'rows_examined': examined, 'index_nodes_visited': visited, 'limit': limit}


class Database:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.ownership = DirectoryLock(self.directory)
        try:
            self.tables = {name: Table(self.directory / f'{name}.jsonl', schema) for name, schema in SCHEMAS.items()}
        except Exception:
            self.ownership.close()
            raise

    def execute(self, sql):
        statements = parse(sql)
        results = []
        for statement in statements:
            start = time.perf_counter()
            if statement['table'] not in self.tables:
                raise ValueError('Unknown table. Available tables: scores, products')
            table = self.tables[statement['table']]
            if statement['op'] == 'INSERT':
                result = {'row': table.append(statement['values']), 'plan': 'APPEND+INDEX'}
            else:
                result = table.select(statement['columns'], statement['where'], statement['limit'])
            results.append({**result, 'elapsed_ms': round((time.perf_counter() - start) * 1000, 4)})
        return results

    def stats(self):
        result = {}
        for name, table in self.tables.items():
            with table.lock:
                result[name] = {**table.index.stats(), 'file_bytes': table.path.stat().st_size}
        return result

    def close(self):
        self.ownership.close()
