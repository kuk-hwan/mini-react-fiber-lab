import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { setupLab } from '../src/lab/lab.js';
import { setupBoard } from '../src/demo/board.js';

async function setup() {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const window = new JSDOM(html, { url: 'http://localhost/' }).window;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.MutationObserver = window.MutationObserver;
  globalThis.localStorage = window.localStorage;
  return {
    window,
    document: window.document,
    event: (name) => new window.Event(name, { bubbles: true, cancelable: true }),
  };
}
test('Phase 1: HTML edit, Patch, undo/redo, branching, no-op, duplicate key failure', async () => {
  const { document, event, window } = await setup();
  const lab = setupLab();
  const source = document.querySelector('#source'),
    actual = document.querySelector('#actual');
  const original = actual.querySelector('h2');
  source.value = source.value.replace('조금씩, 더 나은 코드.', '테스트 제목');
  source.dispatchEvent(event('input'));
  document.querySelector('#patch').click();
  assert.equal(actual.querySelector('h2').textContent, '테스트 제목');
  assert.equal(actual.querySelector('h2'), original);
  assert.equal(lab.history.entries.length, 2);
  document.querySelector('#undo').click();
  assert.equal(actual.querySelector('h2').textContent, '조금씩, 더 나은 코드.');
  document.querySelector('#redo').click();
  assert.equal(actual.querySelector('h2').textContent, '테스트 제목');
  document.querySelector('#patch').click();
  assert.equal(lab.history.entries.length, 2);
  document.querySelector('#undo').click();
  source.value = '<p>새 분기</p>';
  source.dispatchEvent(event('input'));
  document.querySelector('#patch').click();
  assert.equal(lab.history.canRedo, false);
  assert.equal(actual.textContent, '새 분기');
  source.value = '<ul><li data-key="a">a</li><li data-key="a">b</li></ul>';
  source.dispatchEvent(event('input'));
  document.querySelector('#patch').click();
  assert.match(document.querySelector('#lab-message').textContent, /중복 key/);
  assert.equal(actual.textContent, '새 분기');
  window.close();
});
test('Phase 1: direct DOM mutation is detected and form values travel through history', async () => {
  const { document, event, window } = await setup();
  const lab = setupLab();
  const source = document.querySelector('#source');
  source.value = '<input value="old"><input type="checkbox">';
  source.dispatchEvent(event('input'));
  document.querySelector('#patch').click();
  document.querySelector('#preview-mode').click();
  const input = document.querySelector('#test input');
  input.value = 'live';
  input.dispatchEvent(event('input'));
  document.querySelector('#test [type=checkbox]').checked = true;
  document.querySelector('#patch').click();
  assert.equal(document.querySelector('#actual input').value, 'live');
  assert.equal(document.querySelector('#actual [type=checkbox]').checked, true);
  document.querySelector('#undo').click();
  assert.equal(document.querySelector('#actual input').value, 'old');
  document.querySelector('#redo').click();
  assert.equal(document.querySelector('#test input').value, 'live');
  document.querySelector('#test').firstChild.append(document.createElement('hr'));
  await Promise.resolve();
  assert.equal(lab.dirty, true);
  window.close();
});
test('Phase 2: board add, search, toggle, reverse, delete, batching and persistence', async () => {
  const { document, event, window } = await setup();
  const board = setupBoard();
  board.flushSync();
  const root = document.querySelector('#hooks-app'),
    input = document.querySelector('#new-task');
  input.value = 'Write tests';
  input.dispatchEvent(event('input'));
  board.flushSync();
  assert.equal(document.querySelector('#new-task'), input); // Focus-bearing DOM identity remains stable.
  root.querySelector('form').dispatchEvent(event('submit'));
  board.flushSync();
  assert.equal(root.querySelectorAll('.task-row').length, 5);
  const search = root.querySelector('[type=search]');
  search.value = 'Write';
  search.dispatchEvent(event('input'));
  board.flushSync();
  assert.equal(root.querySelectorAll('.task-row').length, 1);
  root.querySelector('.task-checkbox').click();
  board.flushSync();
  assert.ok(root.querySelector('.task-row').classList.contains('task-done'));
  search.value = '';
  search.dispatchEvent(event('input'));
  board.flushSync();
  const last = root.querySelector('.task-list').lastChild;
  root.querySelector('.board-bottom button').click();
  board.flushSync();
  assert.equal(root.querySelector('.task-list').firstChild, last);
  const before = board.commitCount;
  root.querySelector('.dark-button').click();
  board.flushSync();
  assert.equal(root.querySelector('#batch-value').textContent, '3');
  assert.equal(board.commitCount, before + 1);
  root.querySelector('.delete-task').click();
  board.flushSync();
  assert.equal(root.querySelectorAll('.task-row').length, 4);
  assert.equal(JSON.parse(window.localStorage.getItem('fiber-lab-tasks-v1')).length, 4);
  board.unmount();
  window.close();
});
