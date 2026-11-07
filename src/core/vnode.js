export const TEXT = '#text';
export const COMMENT = '#comment';

export function normalizeChildren(children) {
  return children
    .flat(Infinity)
    .filter((child) => child !== null && child !== undefined && typeof child !== 'boolean')
    .map((child) => (typeof child === 'object' ? child : text(child)));
}

export function text(value) {
  return { type: TEXT, key: null, props: { nodeValue: String(value) }, children: [] };
}

export function h(type, props = {}, ...children) {
  props = props ?? {};
  const { key = null, ...rest } = props;
  return {
    type,
    key: key === null ? null : String(key),
    props: rest,
    children: normalizeChildren(children),
  };
}

/** Read live form properties as well as attributes; preserve whitespace and comments. */
export function domToVNode(node) {
  if (node.nodeType === 3) return text(node.nodeValue);
  if (node.nodeType === 8)
    return { type: COMMENT, key: null, props: { nodeValue: node.nodeValue }, children: [] };
  if (node.nodeType !== 1) throw new TypeError('Element, Text 또는 Comment 노드가 필요합니다.');
  const props = Object.fromEntries([...node.attributes].map((attr) => [attr.name, attr.value]));
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) && node.type !== 'file')
    props.value = node.value;
  if (node.tagName === 'INPUT' && ['checkbox', 'radio'].includes(node.type))
    props.checked = node.checked;
  if (node.tagName === 'OPTION') props.selected = node.selected;
  return {
    type: node.localName,
    key: node.getAttribute('data-key'),
    props,
    namespace: node.namespaceURI,
    children: [...node.childNodes].map(domToVNode),
  };
}

export function assertUniqueKeys(children) {
  const keys = new Set();
  for (const child of children) {
    if (child.key === null || child.key === undefined) continue;
    if (keys.has(child.key)) throw new Error(`중복 key: ${child.key}`);
    keys.add(child.key);
  }
}

export function matchChildren(previous, next) {
  assertUniqueKeys(previous);
  assertUniqueKeys(next);
  const keyed = new Map(
    previous.flatMap((child, index) => (child.key == null ? [] : [[child.key, index]])),
  );
  const used = new Set();
  const matches = next.map((child, index) => {
    const match =
      child.key != null
        ? keyed.get(child.key)
        : previous[index]?.key == null && index < previous.length
          ? index
          : undefined;
    if (match === undefined || used.has(match)) return -1;
    used.add(match);
    return match;
  });
  return {
    matches,
    removed: previous.map((_, index) => index).filter((index) => !used.has(index)),
  };
}
