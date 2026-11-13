"""Reproducible measurement; temporary isolated data, no artificial delays."""
import argparse
import json
import platform
import statistics
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen
from .server import Application, PoolServer
from .sql import parse


def timed(action):
    start = time.perf_counter()
    result = action()
    return (time.perf_counter() - start) * 1000, result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--rows', type=int, default=1000000)
    parser.add_argument('--output', default='docs/benchmarks/latest.json')
    args = parser.parse_args()
    if args.rows < 1:
        parser.error('--rows must be positive')
    with tempfile.TemporaryDirectory(prefix='mini-engine-bench-') as directory:
        app = Application(directory)
        try:
            print(f'Inserting {args.rows:,} SQL records (batches of 10000)...', flush=True)
            def records():
                for i in range(1, args.rows + 1):
                    yield parse(f"INSERT INTO products (name,price) VALUES ('product-{i}',{i})")[0]['values']
            insert_ms, count = timed(lambda: app.db.tables['products'].bulk(records()))
            print(f'Inserted {count:,}. Comparing equal-result queries...', flush=True)
            queries = {
                'indexed': f'SELECT * FROM products WHERE id = {args.rows}',
                'scan': f"SELECT * FROM products WHERE name = 'product-{args.rows}'",
            }
            measurements, plans = {key: [] for key in queries}, {}
            # Warm both paths, then alternate order to reduce systematic order bias.
            for query in queries.values():
                app.db.execute(query)
            for iteration in range(5):
                for key in (['indexed', 'scan'] if iteration % 2 else ['scan', 'indexed']):
                    elapsed, result = timed(lambda: app.db.execute(queries[key])[0])
                    measurements[key].append(elapsed)
                    plans[key] = result
                assert plans['indexed']['rows'] == plans['scan']['rows']
            app.db.tables['scores'].bulk({'name': f'player-{i}', 'attempts': 12, 'pairs': 8} for i in range(1000))
            with PoolServer(('127.0.0.1', 0), app) as server:
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                base = f'http://127.0.0.1:{server.server_port}/api/scores'
                def request(suffix):
                    with urlopen(base + suffix, timeout=10) as response:
                        return json.load(response)
                try:
                    cold_ms, cold = timed(lambda: request(''))
                    assert cold['cache'] == 'MISS'
                    request('')
                    cache_times = {'hit': [], 'bypass': []}
                    for iteration in range(30):
                        for key in (['hit', 'bypass'] if iteration % 2 else ['bypass', 'hit']):
                            elapsed, response = timed(lambda: request('' if key == 'hit' else '?cache=0'))
                            assert response['cache'] == ('HIT' if key == 'hit' else 'BYPASS')
                            assert response['rows'] == cold['rows']
                            cache_times[key].append(elapsed)
                finally:
                    server.shutdown()
                    thread.join()
            report = {
                'measured_at_utc': datetime.now(timezone.utc).isoformat(),
                'python': platform.python_version(), 'platform': platform.platform(),
                'rows': count, 'insert_ms': round(insert_ms, 3),
                'insert_policy': 'Shared SQL parser and Table.bulk; fsync once per 10000 records. HTTP INSERT fsyncs every record.',
                'index': app.db.tables['products'].index.stats(),
                'queries': {key: {'sql': queries[key], 'samples_ms': measurements[key],
                                  'median_ms': statistics.median(measurements[key]),
                                  'rows_examined': plans[key]['rows_examined'],
                                  'index_nodes_visited': plans[key]['index_nodes_visited']} for key in queries},
                'index_speedup': statistics.median(measurements['scan']) / statistics.median(measurements['indexed']),
                'cache_http': {'records_in_table': 1000, 'returned_records': 100, 'samples_per_path': 30,
                               'cold_miss_ms': cold_ms,
                               **{key: {'median_ms': statistics.median(values), 'samples_ms': values} for key, values in cache_times.items()},
                               'speedup': statistics.median(cache_times['bypass']) / statistics.median(cache_times['hit'])},
                'notes': ['Warm OS file cache; last-record exact-match queries with identical results.',
                          'HTTP timings include loopback TCP, JSON serialization and scheduling; no injected delay.',
                          'Small datasets may make caching slower. Measurements are machine-specific, not a Redis comparison.'],
            }
            target = Path(args.output)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(report, indent=2), encoding='utf-8')
            print(json.dumps({k: report[k] for k in ('rows', 'insert_ms', 'index_speedup')}, indent=2), flush=True)
            print(f'Cache HTTP speedup: {report["cache_http"]["speedup"]:.3f}x. Report: {target}', flush=True)
        finally:
            app.close()


if __name__ == '__main__':
    main()
