import { FunctionComponent, h, useEffect, useMemo, useState } from '../core/index.ts';
import type { VNode } from '../core/index.ts';
import { api } from './api.ts';
import type { Score } from './api.ts';
import './systems.css';

interface Result {
  cache?: string;
  plan?: string;
  rows?: Score[];
  row?: Score;
  trace?: string[];
  results?: { plan: string; rows_examined?: number; index_nodes_visited?: number }[];
  worker?: string;
  request_ms?: number;
}
interface Metrics {
  cache: { keys: number; hits: number; misses: number; capacity: number; bucket_lengths: number[] };
  tables: Record<string, { entries: number; height: number; nodes_per_level: number[] }>;
}

function ScoreTable({ rows }: { rows: Score[] }): VNode {
  return h(
    'table',
    { className: 'systems-table' },
    h('caption', {}, '저장된 게임 기록 · ID 순 최대 100개'),
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        ...['ID', '이름', '시도', '맞춘 짝'].map((text) => h('th', { scope: 'col' }, text)),
      ),
    ),
    h(
      'tbody',
      {},
      ...rows.map((row) =>
        h(
          'tr',
          { key: row.id },
          h('td', {}, row.id),
          h('td', {}, row.name),
          h('td', {}, row.attempts),
          h('td', {}, `${row.pairs} / 8`),
        ),
      ),
    ),
  );
}

export function setupSystems(container: HTMLElement) {
  let alive = true;
  let busy = false;
  const app = new FunctionComponent(function Systems(): VNode {
    const [name, setName] = useState('플레이어');
    const [sql, setSql] = useState('SELECT * FROM scores WHERE id = 1');
    const [result, setResult] = useState<Result | null>(null);
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [rows, setRows] = useState<Score[]>([]);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [key, setKey] = useState('greeting');
    const [value, setValue] = useState('안녕 Mini Redis');
    const [ttl, setTTL] = useState('10');
    const summary = useMemo(
      () => ({ games: rows.length, pairs: rows.reduce((sum, row) => sum + row.pairs, 0) }),
      [rows],
    );

    useEffect(() => {
      void api<Metrics>('/api/metrics')
        .then((data) => {
          if (alive) setMetrics(data);
        })
        .catch(() => {
          if (alive) setError('서버 연결 대기 중 · 별도 터미널에서 npm run server를 실행하세요.');
        });
    }, []);

    async function run(path: string, method = 'GET', body?: unknown) {
      if (busy) return;
      busy = true;
      setPending(true);
      setError('');
      try {
        const response = await api<Result>(path, method, body);
        if (!alive) return;
        setResult(response);
        if (response.rows) setRows(response.rows);
        if (response.row) {
          const saved = response.row;
          setRows((previous) =>
            [...previous.filter((row) => row.id !== saved.id), saved]
              .sort((a, b) => a.id - b.id)
              .slice(0, 100),
          );
        }
        const stats = await api<Metrics>('/api/metrics');
        if (alive) setMetrics(stats);
      } catch (reason) {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        busy = false;
        if (alive) setPending(false);
      }
    }
    const button = (text: string, action: () => void, primary = false) =>
      h(
        'button',
        {
          type: 'button',
          className: primary ? 'primary-button' : 'trace-button',
          disabled: pending,
          onClick: action,
        },
        text,
      );
    const steps =
      result?.trace ??
      (result?.results
        ? [
            'HTTP 요청 → 스레드 풀 배정',
            'SQL 토큰화 → 파싱',
            ...result.results.map(
              (item) =>
                `${item.plan} · 읽은 행 ${item.rows_examined ?? 0}개 · 인덱스 노드 ${item.index_nodes_visited ?? 0}개`,
            ),
          ]
        : []);
    return h(
      'div',
      { className: 'systems-dashboard' },
      h(
        'header',
        { className: 'systems-hero' },
        h('p', { className: 'mini-label' }, 'THREE ENGINES · ONE APPLICATION'),
        h('h1', {}, '화면에서 저장소까지'),
        h(
          'p',
          {},
          '직접 만든 Mini React로 요청하고, Mini Redis와 Mini DBMS의 실제 응답을 확인하세요.',
        ),
        h('a', { href: '#game' }, '← 카드 게임으로 돌아가기'),
      ),
      h(
        'ol',
        { className: 'systems-pipeline', 'aria-label': '전체 연결 구조' },
        ...[
          'Mini React · 상태와 DOM',
          'HTTP API · 스레드 풀',
          'Mini Redis · 해시 + TTL',
          'Mini DBMS · SQL + B+ 트리',
        ].map((label, i) => h('li', {}, h('b', {}, `0${i + 1}`), label)),
      ),
      h(
        'div',
        { className: 'systems-grid' },
        h(
          'div',
          { className: 'systems-controls' },
          h(
            'section',
            { className: 'panel systems-card' },
            h('h2', {}, '01 · 기록 저장과 API 캐시'),
            h(
              'p',
              {},
              '게임의 “현재 기록 저장”으로 실제 기록을 보내거나, 아래에서 샘플 기록으로 실험하세요.',
            ),
            h('label', { htmlFor: 'score-name' }, '샘플 플레이어 이름'),
            h('input', {
              id: 'score-name',
              value: name,
              maxLength: 200,
              onInput: (event: Event) => setName((event.target as HTMLInputElement).value),
            }),
            h(
              'div',
              { className: 'systems-actions' },
              button(
                '샘플 기록 저장',
                () => {
                  void run('/api/scores', 'POST', { name, attempts: 12, pairs: 8 });
                },
                true,
              ),
              button('캐시로 조회', () => {
                void run('/api/scores');
              }),
              button('캐시 없이 조회', () => {
                void run('/api/scores?cache=0');
              }),
              button('목록 캐시 무효화', () => {
                void run('/api/cache/scores', 'DELETE');
              }),
            ),
            h(
              'p',
              { className: 'systems-note' },
              '첫 조회 MISS → 10초 안에 다시 조회 HIT. 기록을 저장하면 기존 캐시가 무효화됩니다.',
            ),
            h(
              'p',
              {},
              `화면에 불러온 기록 ${summary.games}개 · 맞춘 짝 합계 ${summary.pairs}개 (useMemo)`,
            ),
            h(ScoreTable, { rows }),
          ),
          h(
            'section',
            { className: 'panel systems-card' },
            h('h2', {}, '02 · SQL 처리기와 인덱스'),
            h('label', { htmlFor: 'sql-editor' }, 'SQL 문장'),
            h('textarea', {
              id: 'sql-editor',
              value: sql,
              rows: 3,
              spellcheck: false,
              onInput: (event: Event) => setSql((event.target as HTMLTextAreaElement).value),
            }),
            h(
              'div',
              { className: 'systems-actions' },
              button(
                'SQL 실행',
                () => {
                  void run('/api/sql', 'POST', { sql });
                },
                true,
              ),
              button('ID 검색 예시', () => setSql('SELECT * FROM scores WHERE id = 1')),
              button('이름 검색 예시', () =>
                setSql(`SELECT * FROM scores WHERE name = '${name.replaceAll("'", "''")}'`),
              ),
            ),
            h(
              'p',
              { className: 'systems-note' },
              'ID 조건은 B+TREE, 이름 조건은 FULL_SCAN. 오른쪽에서 실제 읽은 행 수를 비교하세요.',
            ),
          ),
          h(
            'section',
            { className: 'panel systems-card' },
            h('h2', {}, '03 · Mini Redis 키 · 값 · TTL'),
            h(
              'div',
              { className: 'systems-fields' },
              h(
                'label',
                {},
                'Key',
                h('input', {
                  value: key,
                  onInput: (event: Event) => setKey((event.target as HTMLInputElement).value),
                }),
              ),
              h(
                'label',
                {},
                'Value',
                h('input', {
                  value,
                  onInput: (event: Event) => setValue((event.target as HTMLInputElement).value),
                }),
              ),
              h(
                'label',
                {},
                'TTL (초)',
                h('input', {
                  type: 'number',
                  min: 0,
                  value: ttl,
                  onInput: (event: Event) => setTTL((event.target as HTMLInputElement).value),
                }),
              ),
            ),
            h(
              'div',
              { className: 'systems-actions' },
              button('SET', () => {
                void run(`/api/kv/${encodeURIComponent(key)}`, 'PUT', { value, ttl: Number(ttl) });
              }),
              button('GET', () => {
                void run(`/api/kv/${encodeURIComponent(key)}`);
              }),
              button('DEL', () => {
                void run(`/api/kv/${encodeURIComponent(key)}`, 'DELETE');
              }),
              button('스냅샷 저장', () => {
                void run('/api/cache/snapshot', 'POST');
              }),
            ),
            h(
              'p',
              { className: 'systems-note' },
              'TTL이 지나면 GET은 found: false. 스냅샷은 재시작 시 만료되지 않은 키만 복원합니다.',
            ),
          ),
        ),
        h(
          'aside',
          { className: 'systems-inspector', 'aria-label': '저장소 실행 기록' },
          h(
            'section',
            { className: 'panel systems-card' },
            h('h2', {}, '이번 요청에서 일어난 일'),
            h(
              'p',
              { role: 'status', 'aria-live': 'polite', id: 'systems-status' },
              pending
                ? '실제 서버 요청 중…'
                : result
                  ? `${result.cache ?? result.results?.[0]?.plan ?? '완료'} · ${result.worker ?? ''} · ${result.request_ms ?? 0}ms`
                  : '왼쪽에서 요청을 실행해 보세요.',
            ),
            h('p', { role: 'alert', hidden: !error, className: 'systems-error' }, error),
            h(
              'ol',
              { className: 'systems-trace' },
              ...steps.map((step) => h('li', {}, step)),
              ...(result
                ? [h('li', {}, '응답 → useState → Fiber → Diff · Patch → 현재 화면')]
                : []),
            ),
            h(
              'details',
              { open: true },
              h('summary', {}, '서버의 실제 JSON 응답'),
              h('pre', { id: 'systems-response' }, result ? JSON.stringify(result, null, 2) : '{}'),
            ),
          ),
          h(
            'section',
            { className: 'panel systems-card' },
            h('h2', {}, '해시 테이블과 B+ 트리'),
            h(
              'p',
              {},
              metrics
                ? `키 ${metrics.cache.keys}개 / 버킷 ${metrics.cache.capacity}개 · HIT ${metrics.cache.hits} / MISS ${metrics.cache.misses}`
                : '연결 후 표시됩니다.',
            ),
            h(
              'div',
              { className: 'systems-buckets', 'aria-label': '처음 64개 해시 버킷의 항목 수' },
              ...(metrics?.cache.bucket_lengths ?? []).map((length, i) =>
                h(
                  'span',
                  { key: i, title: `버킷 ${i}: ${length}개`, className: length ? 'occupied' : '' },
                  length,
                ),
              ),
            ),
            ...Object.entries(metrics?.tables ?? {}).map(([table, stat]) =>
              h(
                'p',
                {},
                `${table}: ${stat.entries}개 · 트리 높이 ${stat.height} · 층별 노드 ${stat.nodes_per_level.join(' → ')}`,
              ),
            ),
            h(
              'p',
              { className: 'systems-note' },
              '요청 완료 후 새로 수집한 값입니다. 100만 건 비교는 npm run bench로 실행합니다.',
            ),
          ),
        ),
      ),
    );
  }, {});
  app.mount(container);
  return {
    unmount() {
      alive = false;
      app.unmount();
    },
  };
}
