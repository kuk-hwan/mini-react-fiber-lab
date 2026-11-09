import { FunctionComponent, h, useEffect, useMemo, useState } from '../core/index.ts';
import { groups, questions, recommend } from './catalog.ts';

type Session = { step: number; answers: readonly number[] };
type Match = NonNullable<ReturnType<typeof recommend>>;
const total = questions.length;

function RecordArt() {
  return h(
    'div',
    { class: 'sm-record', 'aria-hidden': 'true' },
    h('div', { class: 'sm-record-label' }, '✦'),
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  return h(
    'section',
    { class: 'sm-intro', 'aria-labelledby': 'quiz-stage-title' },
    h(
      'div',
      { class: 'sm-intro-copy' },
      h('div', { class: 'sm-kicker' }, 'THE K-POP TASTE TEST'),
      h(
        'h1',
        { id: 'quiz-stage-title', tabindex: '-1' },
        '내 취향에 맞는',
        h('br', null),
        '아이돌은 ',
        h('em', null, '누구?'),
      ),
      h(
        'p',
        null,
        '좋아하는 음악과 무대를 골라보세요. 내 플레이리스트에 어울리는 그룹과 첫 곡을 찾아드려요.',
      ),
      h(
        'div',
        { class: 'sm-intro-action' },
        h(
          'button',
          { class: 'sm-primary', type: 'button', onClick: onStart },
          '취향 테스트 시작',
          h('span', { 'aria-hidden': 'true' }, '↗'),
        ),
        h('span', { class: 'sm-small' }, `${total}문항 · 약 1분`),
      ),
    ),
    h(
      'div',
      { class: 'sm-hero-art', 'aria-hidden': 'true' },
      h('span', { class: 'sm-art-edition' }, 'STAGE MATCH', h('span', null, 'VOL. 01')),
      h('span', { class: 'sm-orbit sm-orbit-a' }),
      h('span', { class: 'sm-orbit sm-orbit-b' }),
      h('span', { class: 'sm-art-spark sm-art-spark-a' }, '✦'),
      h('span', { class: 'sm-art-spark sm-art-spark-b' }, '✧'),
      h('span', { class: 'sm-art-type' }, 'FIND', h('br', null), 'YOUR', h('br', null), 'FAVE.'),
      h(RecordArt, null),
      h('span', { class: 'sm-art-bottom' }, 'K-POP DISCOVERY', h('span', null, '33 ⅓ RPM')),
    ),
    h(
      'div',
      { class: 'sm-intro-note' },
      h('span', { 'aria-hidden': 'true' }, '✦'),
      `${groups.length}팀의 무드와 입문곡을 만나보세요.`,
    ),
  );
}

function Question({
  session,
  onAnswer,
  onBack,
}: {
  session: Session;
  onAnswer: (answer: number) => void;
  onBack: () => void;
}) {
  const { step, answers } = session;
  const question = questions[step];
  const number = String(step + 1).padStart(2, '0');
  return h(
    'section',
    { class: 'sm-question', 'aria-labelledby': 'quiz-stage-title' },
    h(
      'div',
      { class: 'sm-progress' },
      h(
        'div',
        { class: 'sm-progress-label' },
        h('span', null, 'YOUR TASTE JOURNEY'),
        h('strong', null, `${number} / ${String(total).padStart(2, '0')}`),
      ),
      h('progress', { max: total, value: step + 1, 'aria-label': '질문 진행률' }),
    ),
    h(
      'div',
      { class: 'sm-question-card' },
      h('div', { class: 'sm-kicker' }, `QUESTION ${number}`),
      h('h1', { id: 'quiz-stage-title', tabindex: '-1' }, question.title),
      h('p', { class: 'sm-small' }, '마음이 가는 답을 하나 골라주세요.'),
      h(
        'div',
        { class: 'sm-options' },
        question.choices.map(({ label }, index) => {
          const selected = answers[step] === index;
          return h(
            'button',
            {
              key: index,
              class: 'sm-option',
              type: 'button',
              'data-selected': String(selected),
              onClick: () => onAnswer(index),
            },
            h('span', { class: 'sm-option-letter', 'aria-hidden': 'true' }, 'ABC'[index]),
            h(
              'span',
              null,
              label,
              selected && h('span', { class: 'sr-only' }, ' (이전에 고른 답)'),
            ),
            h('span', { class: 'sm-option-arrow', 'aria-hidden': 'true' }, selected ? '✓' : '→'),
          );
        }),
      ),
    ),
    h(
      'button',
      { class: 'sm-back', type: 'button', onClick: onBack },
      step === 0 ? '← 시작 화면' : '← 이전 질문',
    ),
  );
}

function Result({
  match,
  onBack,
  onRestart,
}: {
  match: Match;
  onBack: () => void;
  onRestart: () => void;
}) {
  const { group, reasons } = match;
  return h(
    'section',
    { class: 'sm-result', 'aria-labelledby': 'quiz-stage-title' },
    h(
      'header',
      { class: 'sm-result-heading' },
      h('div', { class: 'sm-kicker' }, 'YOUR K-POP MATCH'),
      h('h1', { id: 'quiz-stage-title', tabindex: '-1' }, '취향에 어울리는 그룹을 찾았어요.'),
    ),
    h(
      'div',
      { class: 'sm-result-grid' },
      h(
        'section',
        { class: 'sm-group-cover', 'data-group': group.id, 'aria-label': '추천 아이돌 그룹' },
        h(
          'div',
          { class: 'sm-cover-top' },
          h('span', null, 'YOUR MATCH'),
          h('span', null, '01 / 01'),
        ),
        h('span', { class: 'sm-cover-spark', 'aria-hidden': 'true' }, '✦'),
        h(RecordArt, null),
        h(
          'div',
          { class: 'sm-group-name' },
          h('div', { class: 'sm-cover-mood' }, group.mood),
          h('h2', null, group.name),
          h('p', null, group.korean),
        ),
      ),
      h(
        'section',
        { class: 'sm-result-card sm-reason' },
        h('div', { class: 'sm-kicker' }, '01 / WHY IT FITS'),
        h('h2', null, '추천 이유'),
        h(
          'div',
          { class: 'sm-tags' },
          group.tags.map((tag) => h('span', { key: tag }, tag)),
        ),
        h('p', null, group.description),
        h(
          'ul',
          { class: 'sm-reason-answers', 'aria-label': '추천에 반영된 내 답변' },
          reasons.map((reason) => h('li', { key: reason }, reason)),
        ),
      ),
      h(
        'section',
        { class: 'sm-result-card sm-track' },
        h('div', { class: 'sm-kicker' }, '02 / FIRST TRACK'),
        h('h2', null, '이 노래부터 들어보세요'),
        h(
          'a',
          {
            class: 'sm-track-link',
            href: group.video,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          h('span', { class: 'sm-play', 'aria-hidden': 'true' }, '▶'),
          h(
            'span',
            null,
            h('strong', null, group.song),
            h('small', null, '공식 뮤직비디오 · 새 탭'),
          ),
          h('span', { 'aria-hidden': 'true' }, '↗'),
        ),
      ),
    ),
    h(
      'div',
      { class: 'sm-result-actions' },
      h('button', { class: 'sm-back', type: 'button', onClick: onBack }, '← 마지막 답변 수정'),
      h(
        'button',
        { class: 'sm-primary', type: 'button', onClick: onRestart },
        '다시 테스트하기',
        h('span', { 'aria-hidden': 'true' }, '↻'),
      ),
    ),
  );
}

function StageMatch() {
  const [session, setSession] = useState<Session | null>(null);
  const step = session?.step;
  const answers = session?.answers;
  const match = useMemo(
    () => (step === total && answers ? recommend(answers) : null),
    [step, answers],
  );
  useEffect(() => {
    document.getElementById('quiz-stage-title')?.focus({ preventScroll: true });
  }, [step]);

  function answer(choice: number) {
    setSession((current) => {
      if (!current || current.step !== step || current.step === total) return current;
      const nextAnswers = [...current.answers];
      nextAnswers[current.step] = choice;
      return { step: current.step + 1, answers: nextAnswers };
    });
  }

  function back() {
    setSession((current) => {
      if (!current || current.step !== step) return current;
      if (current.step === 0) return null;
      return { ...current, step: current.step - 1 };
    });
  }

  if (!session) return h(Intro, { onStart: () => setSession({ step: 0, answers: [] }) });
  if (match) return h(Result, { match, onBack: back, onRestart: () => setSession(null) });
  return h(Question, { session, onAnswer: answer, onBack: back });
}

export function setupQuiz(root: HTMLElement) {
  return new FunctionComponent(StageMatch).mount(root);
}
