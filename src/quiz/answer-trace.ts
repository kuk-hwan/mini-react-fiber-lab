import type { CommitMetrics, PatchOperation } from '../core/index.ts';
import { mustQuery } from '../shared/dom.ts';
import { questions } from './catalog.ts';

export type Session = { step: number; answers: readonly number[] };

function elementAt(root: Node | null, path: string): Element | null {
  let node: Node | null = root;
  for (const index of path.split('.').slice(1)) {
    node = node?.childNodes.item(Number(index)) ?? null;
  }
  return node?.nodeType === 1 ? (node as Element) : (node?.parentElement ?? null);
}

function highlight(operations: PatchOperation[], root: Node | null) {
  const highlights = new Map<string, { type: PatchOperation['type']; detail: string }>();
  for (const operation of operations) {
    if (operation.type === 'REMOVE') continue;
    const element = elementAt(root, operation.path);
    if (!element) continue;
    const { type, detail } = operation;
    if (type === 'TEXT' && element.id === 'quiz-stage-title') {
      highlights.set('화면 제목', { type, detail });
    } else if (type === 'PROPS' && detail === 'value' && element.matches('progress')) {
      highlights.set('진행률', {
        type,
        detail: `${element.getAttribute('value')} / ${element.getAttribute('max')}`,
      });
    } else if (type === 'TEXT' && element.closest('.sm-option') && !highlights.has('선택지')) {
      highlights.set('선택지', { type, detail });
    } else if (
      (type === 'CREATE' || type === 'REPLACE') &&
      element.closest('.sm-result-heading, .sm-result-grid') &&
      !highlights.has('결과 화면')
    ) {
      highlights.set('결과 화면', { type, detail });
    }
  }
  return highlights;
}

function operationRow(type: PatchOperation['type'], detail: string, path?: string): HTMLLIElement {
  const row = document.createElement('li');
  const badge = document.createElement('code');
  const description = document.createElement('span');
  badge.textContent = type;
  description.textContent = detail;
  row.append(badge, description);
  if (path) {
    const position = document.createElement('small');
    position.textContent = path;
    row.append(position);
  }
  return row;
}

export function setupAnswerTrace(panel: HTMLDetailsElement) {
  const choice = mustQuery('#quiz-trace-choice', panel);
  const step = mustQuery('#quiz-trace-step', panel);
  const before = mustQuery('#quiz-trace-before', panel);
  const after = mustQuery('#quiz-trace-after', panel);
  const count = mustQuery('#quiz-trace-count', panel);
  const highlights = mustQuery('#quiz-trace-highlights', panel);
  const log = mustQuery<HTMLDetailsElement>('#quiz-trace-log', panel);
  const entries = mustQuery('#quiz-trace-operations', log);
  let previous: Session | null = null;
  let current: Session | null = null;

  return {
    recordSession(session: Session | null) {
      current = session;
    },
    onCommit({ operations, root }: CommitMetrics) {
      if (previous === current) return;
      const from = previous;
      previous = current;
      if (!from || !current || current.step !== from.step + 1) {
        panel.hidden = true;
        panel.open = false;
        log.open = false;
        return;
      }

      const answer = current.answers[from.step];
      const label = questions[from.step].choices[answer].label;
      const nextStage =
        current.step === questions.length ? '추천 결과' : `${current.step + 1}번 문항`;
      choice.textContent = `${from.step + 1}번 답변 · ${'ABC'[answer]} · ${label}`;
      step.textContent = `${from.step + 1}번 문항 → ${nextStage}`;
      before.textContent = JSON.stringify(from);
      after.textContent = JSON.stringify(current);
      count.textContent = `이번 화면 갱신에서 기록한 Patch 작업 ${operations.length}개`;

      const visibleChanges = highlight(operations, root.dom);
      highlights.replaceChildren(
        ...Array.from(visibleChanges, ([name, { type, detail }]) =>
          operationRow(type, `${name} · ${detail}`),
        ),
      );
      entries.replaceChildren(
        ...operations.map(({ type, detail, path }) => operationRow(type, detail, path)),
      );
      panel.hidden = false;
    },
  };
}
