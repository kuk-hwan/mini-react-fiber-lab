import { TEXT, COMMENT, matchChildren, assertUniqueKeys } from './vnode.js';

/** Generator lets the Fiber scheduler pause between reconciliation units. No DOM writes. */
export function* diffSteps(previous, next, path = '0') {
  // Validate newly inserted subtrees too, before any commit can partially mutate DOM.
  const stack = next ? [next] : [];
  while (stack.length) {
    const node = stack.pop();
    assertUniqueKeys(node.children);
    stack.push(...node.children);
    yield { kind: 'VALIDATE', path };
  }
  return yield* compareSteps(previous, next, path);
}

function* compareSteps(previous, next, path) {
  const plan = { previous, next, path, kind: 'NONE', props: [], children: [], removed: [] };
  if (!previous && next) plan.kind = 'CREATE';
  else if (previous && !next) plan.kind = 'REMOVE';
  else if (previous && next) {
    if (
      previous.type !== next.type ||
      previous.key !== next.key ||
      previous.namespace !== next.namespace
    )
      plan.kind = 'REPLACE';
    else if (next.type === TEXT || next.type === COMMENT) {
      if (previous.props.nodeValue !== next.props.nodeValue) plan.kind = 'TEXT';
    } else {
      plan.kind = 'UPDATE';
      for (const name of new Set([...Object.keys(previous.props), ...Object.keys(next.props)])) {
        if (!Object.is(previous.props[name], next.props[name]))
          plan.props.push({ name, previous: previous.props[name], value: next.props[name] });
      }
      const { matches, removed } = matchChildren(previous.children, next.children);
      plan.removed = removed;
      yield plan;
      for (let index = 0; index < next.children.length; index++) {
        const oldIndex = matches[index];
        const childPlan = yield* compareSteps(
          previous.children[oldIndex] ?? null,
          next.children[index],
          `${path}.${index}`,
        );
        plan.children.push({ oldIndex, plan: childPlan });
      }
      return plan;
    }
  }
  yield plan;
  return plan;
}

export function diff(previous, next) {
  const iterator = diffSteps(previous, next);
  let result;
  do {
    result = iterator.next();
  } while (!result.done);
  return result.value;
}
