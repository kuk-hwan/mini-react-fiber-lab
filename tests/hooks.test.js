import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environment } from './helpers.js';
import { h, FunctionComponent, useState, useMemo, useEffect } from '../src/core/index.js';

function mount(Component, options = {}) {
  const { container, window } = environment();
  const instance = new FunctionComponent(Component, {}, options).mount(container);
  instance.flushSync();
  return { instance, container, window };
}
test('useState keeps independent slots, lazy init and stable setters', () => {
  let setA,
    setB,
    init = 0,
    previousSetter;
  const { instance, container } = mount(() => {
    const [a, setterA] = useState(() => {
      init++;
      return 1;
    });
    const [b, setterB] = useState('B');
    if (previousSetter) assert.equal(setterA, previousSetter);
    previousSetter = setterA;
    setA = setterA;
    setB = setterB;
    return h('p', {}, `${a}-${b}`);
  });
  setA(2);
  setB('C');
  instance.flushSync();
  assert.equal(container.textContent, '2-C');
  assert.equal(init, 1);
  instance.unmount();
});
test('three functional updates batch into a single commit and preserve DOM', () => {
  let set;
  const { instance, container } = mount(() => {
    const [n, s] = useState(0);
    set = s;
    return h('p', {}, n);
  });
  const dom = container.firstChild;
  set((n) => n + 1);
  set((n) => n + 1);
  set((n) => n + 1);
  assert.equal(container.textContent, '0');
  instance.flushSync();
  assert.equal(container.textContent, '3');
  assert.equal(instance.commitCount, 2);
  assert.equal(container.firstChild, dom);
  instance.unmount();
});
test('Object.is skips same direct value including NaN', () => {
  let set;
  const { instance } = mount(() => {
    const [n, s] = useState(NaN);
    set = s;
    return h('p', {}, String(n));
  });
  set(NaN);
  instance.flushSync();
  assert.equal(instance.commitCount, 1);
  instance.unmount();
});
test('update queues use functional actions after value replacements in order', () => {
  let set;
  const { instance, container } = mount(() => {
    const [n, s] = useState(0);
    set = s;
    return h('p', {}, n);
  });
  set(8);
  set((n) => n * 2);
  set((n) => n + 1);
  instance.flushSync();
  assert.equal(container.textContent, '17');
  instance.unmount();
});
test('useMemo reuses values until Object.is dependencies change', () => {
  let setCount,
    setOther,
    runs = 0;
  const { instance, container } = mount(() => {
    const [count, a] = useState(1);
    const [other, b] = useState(0);
    setCount = a;
    setOther = b;
    const memo = useMemo(() => {
      runs++;
      return count * 2;
    }, [count]);
    return h('p', {}, `${memo}:${other}`);
  });
  setOther(1);
  instance.flushSync();
  assert.equal(runs, 1);
  setCount(2);
  instance.flushSync();
  assert.equal(runs, 2);
  assert.equal(container.textContent, '4:1');
  instance.unmount();
});
test('memo without deps recomputes; empty dependencies are stable', () => {
  let set,
    all = 0,
    once = 0;
  const { instance } = mount(() => {
    const [n, s] = useState(0);
    set = s;
    useMemo(() => all++);
    useMemo(() => once++, []);
    return h('p', {}, n);
  });
  set(1);
  instance.flushSync();
  assert.equal(all, 2);
  assert.equal(once, 1);
  instance.unmount();
});
test('effects run after commit, clean up before changed setup and on unmount', () => {
  const events = [];
  let set;
  const { container } = environment();
  const instance = new FunctionComponent(() => {
    const [n, s] = useState(0);
    set = s;
    useEffect(() => {
      events.push(`setup:${container.textContent}`);
      return () => events.push(`cleanup:${n}`);
    }, [n]);
    return h('p', {}, n);
  }).mount(container);
  instance.flushSync();
  set(1);
  instance.flushSync();
  instance.unmount();
  assert.deepEqual(events, ['setup:0', 'cleanup:0', 'setup:1', 'cleanup:1']);
});
test('empty effect deps run once; omitted deps run every commit', () => {
  let set,
    once = 0,
    every = 0;
  const { instance } = mount(() => {
    const [n, s] = useState(0);
    set = s;
    useEffect(() => {
      once++;
    }, []);
    useEffect(() => {
      every++;
    });
    return h('p', {}, n);
  });
  set(1);
  instance.flushSync();
  assert.equal(once, 1);
  assert.equal(every, 2);
  instance.unmount();
});
test('effect updates schedule a follow-up render', () => {
  const { instance, container } = mount(() => {
    const [n, set] = useState(0);
    useEffect(() => {
      if (!n) set(1);
    }, [n]);
    return h('p', {}, n);
  });
  assert.equal(container.textContent, '1');
  assert.equal(instance.commitCount, 2);
  instance.unmount();
});
test('hooks outside root and hooks in children fail explicitly', () => {
  assert.throws(() => useState(0), /최상위/);
  const { container } = environment();
  const child = () => {
    useState(0);
    return h('p');
  };
  const instance = new FunctionComponent(() => h('div', {}, h(child))).mount(container);
  assert.throws(() => instance.flushSync(), /최상위/);
  assert.equal(container.childNodes.length, 0);
  instance.unmount();
});
test('hook order and conditional count changes fail before DOM commit', () => {
  let set;
  const { instance, container } = mount(() => {
    const [n, s] = useState(false);
    set = s;
    if (n) useMemo(() => 1, []);
    return h('p', {}, String(n));
  });
  set(true);
  assert.throws(() => instance.flushSync(), /개수/);
  assert.equal(container.textContent, 'false');
  instance.unmount();
  let change;
  const f = mount(() => {
    const [n, s] = useState(false);
    change = s;
    if (n) useEffect(() => {}, []);
    else useMemo(() => 1, []);
    return h('p');
  });
  change(true);
  assert.throws(() => f.instance.flushSync(), /순서/);
  f.instance.unmount();
});
test('props-only child functions rerender and keyed components preserve host identity', () => {
  let reverse;
  const Item = ({ value }) => h('li', {}, value);
  const { instance, container } = mount(() => {
    const [items, set] = useState(['a', 'b', 'c']);
    reverse = () => set((v) => [...v].reverse());
    return h(
      'ul',
      {},
      items.map((value) => h(Item, { key: value, value })),
    );
  });
  const first = container.querySelector('li');
  reverse();
  instance.flushSync();
  assert.equal(container.querySelector('ul').lastChild, first);
  assert.equal(container.textContent, 'cba');
  instance.unmount();
});
test('Fiber render yields without touching DOM until a complete commit', () => {
  const callbacks = [];
  const schedule = (callback) => {
    const entry = { callback, cancelled: false };
    callbacks.push(entry);
    return () => {
      entry.cancelled = true;
    };
  };
  const { container } = environment();
  const instance = new FunctionComponent(
    () =>
      h(
        'ul',
        {},
        Array.from({ length: 20 }, (_, n) => h('li', { key: n }, n)),
      ),
    {},
    { schedule },
  ).mount(container);
  callbacks.shift().callback({ timeRemaining: () => 0 });
  assert.equal(container.childNodes.length, 0);
  assert.ok(instance.work);
  instance.flushSync();
  assert.equal(container.querySelectorAll('li').length, 20);
  assert.ok(instance.metrics.yields > 0);
  assert.ok(instance.current.child.return === instance.current);
  instance.unmount();
});
test('updates arriving during yielded render are preserved for next commit', () => {
  let set;
  const callbacks = [];
  const schedule = (callback) => {
    callbacks.push(callback);
    return () => {};
  };
  const { container } = environment();
  const instance = new FunctionComponent(
    () => {
      const [n, s] = useState(0);
      set = s;
      return h('p', {}, n);
    },
    {},
    { schedule },
  ).mount(container);
  instance.flushSync();
  set((n) => n + 1);
  instance.cancelScheduled = null;
  instance.tick({ timeRemaining: () => 0 }); // consume root's queue snapshot
  set((n) => n + 1);
  instance.flushSync();
  assert.equal(container.textContent, '2');
  instance.unmount();
});
test('unmount cancels unfinished work and later state setters are no-ops', () => {
  let set;
  const { instance, container } = mount(() => {
    const [n, s] = useState(0);
    set = s;
    return h('p', {}, n);
  });
  set(1);
  instance.unmount();
  set(2);
  instance.flushSync();
  assert.equal(container.childNodes.length, 0);
  assert.equal(instance.pending, false);
});
test('async scheduler resolves whenIdle and supports multiple independent roots', async () => {
  const a = environment(),
    b = environment();
  const left = new FunctionComponent(() => h('p', {}, 'left')).mount(a.container);
  const right = new FunctionComponent(() => h('p', {}, 'right')).mount(b.container);
  await Promise.all([left.whenIdle(), right.whenIdle()]);
  assert.equal(a.container.textContent, 'left');
  assert.equal(b.container.textContent, 'right');
  left.unmount();
  right.unmount();
});
