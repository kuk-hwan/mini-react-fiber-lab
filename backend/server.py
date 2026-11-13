"""HTTP JSON API with a bounded thread pool and coordinated cache invalidation."""
import argparse
import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, unquote, urlsplit
from .cache import MiniRedis
from .database import Database
from .sql import parse


class Application:
    def __init__(self, directory):
        self.db = Database(directory)
        self.cache = MiniRedis()
        self.snapshot_path = self.db.directory / 'cache.snapshot.json'
        try:
            self.cache.restore(self.snapshot_path)
        except Exception:
            self.db.close()
            raise
        # API responses are recomputed after restart; user KV entries can be restored.
        self.cache.delete('response:scores')
        self.coordination = threading.RLock()

    def dispatch(self, method, url, body):
        path = urlsplit(url).path
        query = parse_qs(urlsplit(url).query)
        if method == 'GET' and path == '/api/health':
            return {'status': 'ok', 'engine': 'Mini Redis + Mini DBMS'}
        if method == 'GET' and path == '/api/metrics':
            return {'cache': self.cache.stats(), 'tables': self.db.stats(),
                    'thread': threading.current_thread().name}
        if path.startswith('/api/kv/'):
            key = 'user:' + unquote(path[len('/api/kv/'):])
            if key == 'user:':
                raise ValueError('A key is required')
            if method == 'PUT':
                if 'value' not in body:
                    raise ValueError('value is required')
                self.cache.set(key, body['value'], body.get('ttl'))
                return {'stored': True, 'ttl': body.get('ttl')}
            if method == 'GET':
                return self.cache.get(key)
            if method == 'DELETE':
                return {'deleted': self.cache.delete(key)}
        if method == 'POST' and path == '/api/cache/snapshot':
            self.cache.snapshot(self.snapshot_path)
            return {'saved': True}
        if method == 'DELETE' and path == '/api/cache/scores':
            with self.coordination:
                return {'deleted': self.cache.delete('response:scores')}
        if method == 'POST' and path == '/api/sql':
            sql = body.get('sql')
            statements = parse(sql)
            if len(statements) != 1:
                raise ValueError('The HTTP API accepts one SQL statement per request')
            touches_scores = statements[0]['table'] == 'scores'
            if touches_scores:
                with self.coordination:
                    result = self.db.execute(sql)
                    if statements[0]['op'] == 'INSERT':
                        self.cache.delete('response:scores')
            else:
                result = self.db.execute(sql)
            return {'results': result}
        if method == 'POST' and path == '/api/scores':
            with self.coordination:
                row = self.db.tables['scores'].append(body)
                self.cache.delete('response:scores')
                return {'row': row, 'cache': 'INVALIDATED',
                        'trace': ['API 입력 검증', '파일 append + fsync', 'B+ 트리 ID 등록', '목록 캐시 무효화']}
        if method == 'GET' and path == '/api/scores':
            enabled = query.get('cache', ['1'])[0] != '0'
            start = time.perf_counter()
            # Same lock around cache miss + fill and writes prevents stale fill after invalidation.
            with self.coordination:
                cached = self.cache.get('response:scores') if enabled else {'found': False}
                if cached['found']:
                    result = cached['value']
                    status = 'HIT'
                    trace = ['API 요청', '해시 테이블 조회: HIT', '파일 조회 생략', '저장된 JSON 응답 반환']
                else:
                    result = self.db.execute('SELECT * FROM scores LIMIT 100')[0]
                    if enabled:
                        self.cache.set('response:scores', result, ttl=10)
                    status = 'MISS' if enabled else 'BYPASS'
                    trace = ['API 요청', f'캐시 {status}', 'SQL 파싱 → 파일 조회', '응답 캐시 저장 (10초)' if enabled else '캐시 저장 생략']
            return {'rows': result['rows'], 'cache': status,
                    'plan': 'HASH_LOOKUP' if status == 'HIT' else result['plan'],
                    'rows_examined': 0 if status == 'HIT' else result['rows_examined'],
                    'elapsed_ms': round((time.perf_counter() - start) * 1000, 4), 'trace': trace}
        raise LookupError('API route not found')

    def close(self):
        try:
            self.cache.snapshot(self.snapshot_path)
        finally:
            self.db.close()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def handle_api(self):
        started = time.perf_counter()
        try:
            if self.headers.get('Transfer-Encoding'):
                raise ValueError('Transfer-Encoding is unsupported; send Content-Length')
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 <= length <= 65536:
                raise ValueError('Request body must not exceed 64 KiB')
            payload = self.rfile.read(length)
            if len(payload) != length:
                raise ValueError('Incomplete request body')
            body = json.loads(payload) if payload else {}
            if not isinstance(body, dict):
                raise ValueError('JSON body must be an object')
            result = self.server.app.dispatch(self.command, self.path, body)
            code = 200
        except (ValueError, TypeError, UnicodeError) as error:
            code, result = 400, {'error': str(error)}
        except LookupError as error:
            code, result = 404, {'error': str(error)}
        except Exception:
            logging.exception('API request failed')
            code, result = 500, {'error': 'Internal server error; see server log'}
        result['request_ms'] = round((time.perf_counter() - started) * 1000, 4)
        result['worker'] = threading.current_thread().name
        encoded = json.dumps(result, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(encoded)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(encoded)

    do_GET = do_POST = do_PUT = do_DELETE = handle_api


class PoolServer(HTTPServer):
    allow_reuse_address = True

    def __init__(self, address, app, workers=8, queue_size=32):
        if workers < 1 or queue_size < 0:
            raise ValueError('Invalid pool size')
        self.app = app
        self.pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix='mini-db')
        self.slots = threading.BoundedSemaphore(workers + queue_size)
        super().__init__(address, Handler)

    def process_request(self, request, client_address):
        request.settimeout(5)
        if not self.slots.acquire(blocking=False):
            try:
                request.sendall(b'HTTP/1.0 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n')
            finally:
                self.shutdown_request(request)
            return

        def run():
            try:
                self.finish_request(request, client_address)
            except Exception:
                self.handle_error(request, client_address)
            finally:
                self.shutdown_request(request)
                self.slots.release()

        self.pool.submit(run)

    def server_close(self):
        super().server_close()
        self.pool.shutdown(wait=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8787)
    parser.add_argument('--workers', type=int, default=8)
    parser.add_argument('--data', default='.data/server')
    args = parser.parse_args()
    app = Application(args.data)
    try:
        with PoolServer((args.host, args.port), app, workers=args.workers) as server:
            print(f'Mini engines: http://{args.host}:{args.port} | {args.workers} workers', flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
    finally:
        app.close()


if __name__ == '__main__':
    main()
