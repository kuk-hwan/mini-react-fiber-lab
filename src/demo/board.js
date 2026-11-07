import { h, FunctionComponent, useState, useMemo, useEffect } from '../core/index.js';

const STORAGE = 'fiber-lab-tasks-v1';
const initialTasks = [
  { id: 'vdom', title: 'DOM에서 Virtual DOM 추출하기', category: 'ENGINE', done: true },
  { id: 'diff', title: '다섯 가지 Diff 케이스 구현하기', category: 'ENGINE', done: true },
  { id: 'fiber', title: 'Fiber 작업 루프 연결하기', category: 'ARCHITECTURE', done: false },
  { id: 'hooks', title: '나만의 Hooks 완성하기', category: 'HOOKS', done: false },
];

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    if (
      Array.isArray(saved) &&
      saved.length <= 500 &&
      saved.every(
        (task) =>
          typeof task.id === 'string' &&
          typeof task.title === 'string' &&
          typeof task.done === 'boolean' &&
          typeof task.category === 'string',
      ) &&
      new Set(saved.map((t) => t.id)).size === saved.length
    )
      return saved;
  } catch {
    /* Storage may be unavailable; the board remains usable in memory. */
  }
  return initialTasks.map((task) => ({ ...task }));
}

// Children are pure functions of props. All hooks below belong to Board only.
function TaskRow({ task, onToggle, onDelete }) {
  return h(
    'li',
    { className: `task-row ${task.done ? 'task-done' : ''}`, 'data-task-id': task.id },
    h(
      'button',
      {
        className: 'task-checkbox',
        'aria-label': `${task.title} ${task.done ? '미완료로' : '완료로'} 변경`,
        'aria-pressed': task.done,
        onClick: () => onToggle(task.id),
      },
      task.done ? '✓' : '',
    ),
    h(
      'div',
      { className: 'task-copy' },
      h('span', { className: 'task-title' }, task.title),
      h('small', {}, task.category),
    ),
    h(
      'span',
      { className: `task-status ${task.done ? 'done' : ''}` },
      task.done ? '완료' : '진행 중',
    ),
    h(
      'button',
      {
        className: 'delete-task',
        'aria-label': `${task.title} 삭제`,
        onClick: () => onDelete(task.id),
      },
      '×',
    ),
  );
}

function ProgressCard({ completed, total }) {
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return h(
    'aside',
    { className: 'progress-card' },
    h('span', { className: 'section-label' }, 'YOUR MOMENTUM'),
    h('h2', {}, '작은 성취가 쌓이는 중'),
    h('div', { className: 'progress-number' }, String(percent), h('span', {}, '%')),
    h(
      'div',
      {
        className: 'progress-track',
        role: 'progressbar',
        'aria-label': '작업 완료율',
        'aria-valuenow': percent,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
      },
      h('div', { style: { width: `${percent}%` } }),
    ),
    h('p', {}, `${total}개의 작업 중 ${completed}개를 완료했어요.`),
    h('div', { className: 'progress-divider' }),
    h('span', { className: 'section-label' }, 'useMemo'),
    h(
      'p',
      { className: 'progress-explain' },
      '완료 수와 검색 결과는 의존성이 바뀔 때만 다시 계산합니다. 입력창에 새 작업을 적을 때는 계산 결과를 재사용합니다.',
    ),
  );
}

export function setupBoard() {
  const diagnostics = { memoRuns: 0, effectRuns: 0, cleanupRuns: 0, storage: '저장 준비' };
  function Board() {
    const [tasks, setTasks] = useState(loadTasks);
    const [draft, setDraft] = useState('');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [batchCount, setBatchCount] = useState(0);
    const [feedback, setFeedback] = useState('작업을 추가하거나 완료해 보세요.');
    const derived = useMemo(() => {
      diagnostics.memoRuns++;
      return {
        completed: tasks.filter((task) => task.done).length,
        visible: tasks.filter(
          (task) =>
            task.title.toLowerCase().includes(query.toLowerCase()) &&
            (filter === 'all' || (filter === 'done' ? task.done : !task.done)),
        ),
      };
    }, [tasks, query, filter]);
    useEffect(() => {
      diagnostics.effectRuns++;
      try {
        localStorage.setItem(STORAGE, JSON.stringify(tasks));
        diagnostics.storage = '브라우저에 저장됨';
      } catch {
        diagnostics.storage = '메모리에서 동작 중';
      }
      const previousTitle = document.title;
      document.title = `Fiber Lab · ${tasks.filter((task) => !task.done).length} tasks left`;
      return () => {
        diagnostics.cleanupRuns++;
        document.title = previousTitle;
      };
    }, [tasks]);
    const addTask = (event) => {
      event.preventDefault();
      if (!draft.trim()) {
        setFeedback('작업 이름을 입력해 주세요.');
        return;
      }
      if (tasks.length >= 500) {
        setFeedback('최대 500개까지 저장할 수 있습니다.');
        return;
      }
      setTasks((previous) => [
        ...previous,
        { id: crypto.randomUUID(), title: draft.trim(), category: 'MY TASK', done: false },
      ]);
      setDraft('');
      setFeedback('새 작업을 추가했습니다.');
    };
    return h(
      'div',
      { className: 'board' },
      h(
        'div',
        { className: 'board-grid' },
        h(
          'section',
          { className: 'panel task-panel' },
          h(
            'div',
            { className: 'board-heading' },
            h(
              'div',
              {},
              h('span', { className: 'section-label' }, 'MY LEARNING SPRINT'),
              h('h2', {}, '오늘의 작업 보드'),
            ),
            h('span', { className: 'count-badge' }, `${tasks.length} tasks`),
          ),
          h(
            'form',
            { className: 'add-form', onSubmit: addTask },
            h('input', {
              id: 'new-task',
              'aria-label': '새 작업',
              placeholder: '다음으로 만들고 싶은 것은?',
              value: draft,
              maxLength: 120,
              onInput: (event) => setDraft(event.target.value),
            }),
            h('button', { type: 'submit', className: 'primary-button' }, '+ 추가'),
          ),
          h(
            'div',
            { className: 'task-tools' },
            h(
              'div',
              { className: 'filter-tabs', role: 'group', 'aria-label': '작업 필터' },
              ...[
                ['all', '전체'],
                ['active', '진행 중'],
                ['done', '완료'],
              ].map(([value, label]) =>
                h(
                  'button',
                  {
                    key: value,
                    className: filter === value ? 'active' : '',
                    'aria-pressed': filter === value,
                    onClick: () => setFilter(value),
                  },
                  label,
                ),
              ),
            ),
            h('input', {
              className: 'search-input',
              type: 'search',
              'aria-label': '작업 검색',
              placeholder: '작업 검색…',
              value: query,
              onInput: (event) => setQuery(event.target.value),
            }),
          ),
          h(
            'ul',
            { className: 'task-list' },
            ...derived.visible.map((task) =>
              h(TaskRow, {
                key: task.id,
                task,
                onToggle: (id) =>
                  setTasks((previous) =>
                    previous.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
                  ),
                onDelete: (id) => {
                  setTasks((previous) => previous.filter((item) => item.id !== id));
                  setFeedback('작업을 삭제했습니다.');
                },
              }),
            ),
          ),
          derived.visible.length === 0
            ? h('div', { className: 'board-empty' }, '조건에 맞는 작업이 없습니다.')
            : null,
          h(
            'div',
            { className: 'board-bottom' },
            h('span', { role: 'status' }, feedback),
            h(
              'button',
              {
                className: 'text-button',
                onClick: () => setTasks((previous) => [...previous].reverse()),
                disabled: tasks.length < 2,
              },
              '순서 뒤집기 ↕',
            ),
          ),
        ),
        h(ProgressCard, { completed: derived.completed, total: tasks.length }),
      ),
      h(
        'section',
        { className: 'batch-card' },
        h(
          'div',
          {},
          h('span', { className: 'section-label' }, 'BATCHING EXPERIMENT'),
          h('h3', {}, '세 번 바꿔도, 한 번의 렌더링'),
          h(
            'p',
            {},
            '한 클릭에서 함수형 setState를 3번 호출합니다. 아래 commit 수가 1만 증가하는지 확인하세요.',
          ),
        ),
        h(
          'div',
          { className: 'batch-control' },
          h('output', { id: 'batch-value', 'aria-label': '배칭 카운터' }, String(batchCount)),
          h(
            'button',
            {
              className: 'dark-button',
              onClick: () => {
                setBatchCount((n) => n + 1);
                setBatchCount((n) => n + 1);
                setBatchCount((n) => n + 1);
              },
            },
            '+3 한 번에',
          ),
        ),
      ),
    );
  }
  const instance = new FunctionComponent(
    Board,
    {},
    {
      onCommit(metrics) {
        const stats = document.querySelector('#fiber-stats');
        const items = [
          ['COMMITS', metrics.commits],
          ['FIBER UNITS', metrics.units],
          ['YIELDS', metrics.yields],
          ['PATCH OPS', metrics.operations.length],
          ['MEMO 계산', diagnostics.memoRuns],
          ['EFFECT / CLEANUP', `${diagnostics.effectRuns} / ${diagnostics.cleanupRuns}`],
        ];
        stats.replaceChildren(
          ...items.map(([label, value]) => {
            const node = document.createElement('div');
            const title = document.createElement('small');
            title.textContent = label;
            const number = document.createElement('strong');
            number.textContent = String(value);
            node.append(title, number);
            return node;
          }),
        );
        stats.title = `${diagnostics.storage} · Commit ${metrics.commitMs.toFixed(2)}ms`;
        const lines = [];
        const stack = [[metrics.root, 0]];
        while (stack.length) {
          const [fiber, depth] = stack.pop();
          lines.push(
            `${'  '.repeat(depth)}${typeof fiber.type === 'function' ? fiber.type.name : fiber.type}${fiber.key == null ? '' : ` [key=${fiber.key}]`}${fiber.alternate ? ' ↔ alternate' : ' + new'}`,
          );
          if (fiber.sibling) stack.push([fiber.sibling, depth]);
          if (fiber.child) stack.push([fiber.child, depth + 1]);
        }
        document.querySelector('#fiber-tree').textContent = lines.join('\n');
      },
      onError(error) {
        const box = document.querySelector('#hooks-error');
        box.hidden = false;
        box.textContent = error.message;
      },
    },
  ).mount(document.querySelector('#hooks-app'));
  document.querySelector('#toggle-fiber').addEventListener('click', (event) => {
    const tree = document.querySelector('#fiber-tree');
    tree.hidden = !tree.hidden;
    event.currentTarget.textContent = tree.hidden ? '트리 펼치기 ↓' : '트리 접기 ↑';
    event.currentTarget.setAttribute('aria-expanded', String(!tree.hidden));
  });
  return instance;
}
