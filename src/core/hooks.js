let owner = null;

export function withHooks(component, callback) {
  const previous = owner;
  owner = component;
  try {
    return callback();
  } finally {
    owner = previous;
  }
}

function slot(kind) {
  if (!owner)
    throw new Error('Hook은 최상위 FunctionComponent의 렌더링 중에만 사용할 수 있습니다.');
  const instance = owner;
  const index = instance.hookIndex++;
  const previous = instance.hooks[index];
  if (previous && previous.kind !== kind) throw new Error('Hook 호출 순서가 변경되었습니다.');
  return { instance, index, previous };
}

function depsChanged(previous, next) {
  if (next !== undefined && !Array.isArray(next))
    throw new TypeError('의존성은 배열 또는 undefined여야 합니다.');
  return (
    !previous ||
    !next ||
    previous.length !== next.length ||
    next.some((value, i) => !Object.is(value, previous[i]))
  );
}

export function useState(initialValue) {
  const { instance, index, previous } = slot('state');
  const source = previous ?? {
    kind: 'state',
    value: typeof initialValue === 'function' ? initialValue() : initialValue,
    queue: [],
  };
  const generation = instance.generation;
  if (!source.setState)
    source.setState = (action) => {
      if (!instance.mounted || instance.generation !== generation) return;
      if (owner === instance) throw new Error('렌더링 중 setState를 호출할 수 없습니다.');
      if (
        !source.queue.length &&
        typeof action !== 'function' &&
        Object.is(action, instance.hooks[index] ? instance.hooks[index].value : source.value)
      )
        return;
      source.queue.push(action);
      instance.update();
    };
  const consumed = source.queue.length;
  const value = source.queue
    .slice(0, consumed)
    .reduce(
      (state, action) => (typeof action === 'function' ? action(state) : action),
      source.value,
    );
  instance.draftHooks[index] = { ...source, value, consumed };
  return [value, source.setState];
}

export function useMemo(factory, deps) {
  const { instance, index, previous } = slot('memo');
  const value = depsChanged(previous?.deps, deps) ? factory() : previous.value;
  instance.draftHooks[index] = { kind: 'memo', value, deps: deps?.slice() };
  return value;
}

export function useEffect(setup, deps) {
  const { instance, index, previous } = slot('effect');
  if (typeof setup !== 'function') throw new TypeError('effect에는 함수가 필요합니다.');
  instance.draftHooks[index] = {
    kind: 'effect',
    setup,
    deps: deps?.slice(),
    cleanup: previous?.cleanup,
    changed: depsChanged(previous?.deps, deps),
  };
}
