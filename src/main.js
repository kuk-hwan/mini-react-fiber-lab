import { setupLab } from './lab/lab.js';
import { setupBoard } from './demo/board.js';

setupLab();
let board;
const labels = { lab: 'DOM 실험실', hooks: 'Hooks 작업 보드', guide: '엔진 들여다보기' };
function navigate(page) {
  if (!labels[page]) page = 'lab';
  for (const section of document.querySelectorAll('main > .page'))
    section.hidden = section.id !== `page-${page}`;
  for (const button of document.querySelectorAll('[data-page]')) {
    const active = button.dataset.page === page;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  document.querySelector('#page-name').textContent = labels[page];
  if (page === 'hooks' && !board) board = setupBoard();
}
for (const button of document.querySelectorAll('[data-page]'))
  button.addEventListener('click', () => {
    location.hash = button.dataset.page;
  });
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) board?.unmount();
});
navigate(location.hash.slice(1));
