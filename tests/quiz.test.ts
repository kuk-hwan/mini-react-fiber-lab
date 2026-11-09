import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groups, questions, recommend } from '../src/quiz/catalog.ts';

test('quiz matches a complete set of answers and explains the result using selected choices', () => {
  const winners = new Set<string>();
  const combinations = questions.reduce<number[][]>(
    (previous, { choices }) =>
      previous.flatMap((answers) => choices.map((_, index) => [...answers, index])),
    [[]],
  );
  for (const answers of combinations) {
    const result = recommend(answers);
    assert.ok(result);
    winners.add(result.group.id);
    assert.ok(result.reasons.length >= 1 && result.reasons.length <= 2);
    for (const reason of result.reasons) {
      assert.ok(
        answers.some((choice, index) => {
          const selected = questions[index].choices[choice];
          return selected.label === reason && selected.matches.includes(result.group.id);
        }),
      );
    }
  }
  assert.deepEqual(winners, new Set(groups.map(({ id }) => id)));
  assert.equal(recommend(questions.map(() => 0))?.group.id, 'seventeen');
  assert.equal(recommend(questions.map(() => 1))?.group.id, 'stray-kids');
});

test('quiz does not recommend a group for missing or out-of-range answers', () => {
  assert.equal(recommend([]), null);
  assert.equal(recommend(questions.map(() => -1)), null);
});
