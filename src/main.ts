import { setupLab } from './lab/lab.ts';
import { setupBoard } from './demo/board.ts';
import { setupQuiz } from './quiz/quiz.ts';
import { mustQuery } from './shared/dom.ts';

let labReady = false;
let board: ReturnType<typeof setupBoard> | undefined;
let quiz: ReturnType<typeof setupQuiz> | undefined;
const labels = {
  quiz: '아이돌 취향 테스트',
  lab: 'DOM 실험실',
  hooks: 'Hooks 작업 보드',
  guide: '엔진 들여다보기',
};
function navigate(requestedPage: string): void {
  const page = Object.hasOwn(labels, requestedPage)
    ? (requestedPage as keyof typeof labels)
    : 'quiz';
  document.body.dataset.view = page;
  for (const section of document.querySelectorAll<HTMLElement>('main > .page'))
    section.hidden = section.id !== `page-${page}`;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-page]')) {
    const active = button.dataset.page === page;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  mustQuery('#page-name').textContent = labels[page];
  if (page === 'quiz' && !quiz) quiz = setupQuiz(mustQuery('#quiz-app'));
  if (page === 'lab' && !labReady) {
    setupLab();
    labReady = true;
  }
  if (page === 'hooks' && !board) board = setupBoard();
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-page]'))
  button.addEventListener('click', () => {
    location.hash = button.dataset.page ?? 'quiz';
  });
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  quiz?.unmount();
  board?.unmount();
});
navigate(location.hash.slice(1));
