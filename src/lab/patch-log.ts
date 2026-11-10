import type { PatchInspection } from '../core/index.ts';
import { mustQuery } from '../shared/dom.ts';

function showValue(value: string | null): string {
  if (value === null) return '없음';
  if (!value.trim()) return JSON.stringify(value);
  return value;
}

export function setupPatchLog(actual: HTMLElement) {
  const log = mustQuery('#change-log');
  const count = mustQuery('#log-count');
  const selection = mustQuery('#log-selection');
  const title = mustQuery('#log-selection-title');
  const note = mustQuery('#log-selection-note');
  const before = mustQuery('#log-before');
  const after = mustQuery('#log-after');
  let active: HTMLButtonElement | undefined;
  let target: Element | undefined;
  let outline: Animation | undefined;

  function clearSelection(): void {
    active?.setAttribute('aria-pressed', 'false');
    outline?.cancel();
    active = target = outline = undefined;
    selection.hidden = true;
  }

  mustQuery('#log-jump').addEventListener('click', () => {
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  function select(row: HTMLButtonElement, change: PatchInspection): void {
    const alreadySelected = active === row;
    clearSelection();
    if (alreadySelected) return;
    const element =
      change.target.nodeType === 1 ? (change.target as Element) : change.target.parentElement;
    target = element && actual.contains(element) ? element : actual;
    // Keep the sample DOM's attributes and inline styles out of the inspector.
    outline = target.animate([{ outline: '3px solid #7753a6', outlineOffset: '-3px' }], {
      duration: 1,
      fill: 'both',
    });
    active = row;
    row.setAttribute('aria-pressed', 'true');
    title.textContent = `${change.type} · <${target.localName}>`;
    note.textContent =
      change.type === 'REMOVE'
        ? '삭제된 노드의 부모 요소를 강조했어요.'
        : '실제 영역에서 변경 대상을 강조했어요.';
    before.textContent = showValue(change.before);
    after.textContent = showValue(change.after);
    selection.hidden = false;
  }

  function render(changes: readonly PatchInspection[]): void {
    clearSelection();
    count.textContent = `${changes.length} changes`;
    const rows: HTMLElement[] = changes.map((change) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'log-row';
      row.setAttribute('aria-pressed', 'false');
      row.setAttribute('aria-controls', 'log-selection');
      const badge = document.createElement('b');
      badge.className = `op op-${change.type.toLowerCase()}`;
      badge.textContent = change.type;
      const path = document.createElement('code');
      path.textContent = change.path;
      const detail = document.createElement('span');
      detail.textContent = change.detail;
      row.append(badge, path, detail);
      row.addEventListener('click', () => select(row, change));
      return row;
    });
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'log-noop';
      empty.textContent = '변경 없음 — DOM을 그대로 유지했습니다.';
      rows.push(empty);
    }
    log.replaceChildren(...rows);
  }

  return { render, clearSelection };
}
