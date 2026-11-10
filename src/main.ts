import { setupLab } from './lab/lab.ts';
import { setupBoard } from './demo/board.ts';
import { mustQuery } from './shared/dom.ts';

setupLab();
let board: ReturnType<typeof setupBoard> | undefined;
const labels = { lab: 'DOM 실험실', hooks: 'Hooks 작업 보드', guide: '엔진 들여다보기' };
function navigate(requestedPage: string): void {
  const page = requestedPage in labels ? (requestedPage as keyof typeof labels) : 'lab';
  for (const section of document.querySelectorAll<HTMLElement>('main > .page'))
    section.hidden = section.id !== `page-${page}`;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-page]')) {
    const active = button.dataset.page === page;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  mustQuery('#page-name').textContent = labels[page];
  if (page === 'hooks' && !board) board = setupBoard();
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-page]'))
  button.addEventListener('click', () => {
    location.hash = button.dataset.page ?? 'lab';
  });
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) board?.unmount();
});
navigate(location.hash.slice(1));
