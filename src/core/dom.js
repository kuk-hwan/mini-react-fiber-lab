import { TEXT, COMMENT, assertUniqueKeys } from './vnode.js';

const isEvent = (name) => /^on[A-Z]/.test(name);
const booleanProps = new Set([
  'checked',
  'disabled',
  'selected',
  'multiple',
  'required',
  'readOnly',
  'autofocus',
  'hidden',
]);
const attributeName = (name) =>
  ({ className: 'class', htmlFor: 'for', readOnly: 'readonly' })[name] ?? name;

export function setProp(dom, name, previous, value) {
  if (name === 'children' || name === 'key') return;
  if (isEvent(name)) {
    const capture = name.endsWith('Capture');
    const event = name.slice(2, capture ? -7 : undefined).toLowerCase();
    if (typeof previous === 'function') dom.removeEventListener(event, previous, capture);
    if (typeof value === 'function') dom.addEventListener(event, value, capture);
  } else if (name === 'style' && (typeof value === 'object' || typeof previous === 'object')) {
    dom.removeAttribute('style');
    if (typeof value === 'string') dom.setAttribute('style', value);
    else
      for (const [key, val] of Object.entries(value ?? {})) {
        if (key.startsWith('--') || key.includes('-')) dom.style.setProperty(key, val);
        else dom.style[key] = val;
      }
  } else if (name === 'value' && 'value' in dom) {
    const next = value == null ? '' : String(value);
    if (dom.value !== next) dom.value = next;
    if (value == null) dom.removeAttribute('value');
  } else if (booleanProps.has(name)) {
    const enabled = value !== false && value != null;
    if (name in dom) dom[name] = enabled;
    if (enabled) dom.setAttribute(attributeName(name), '');
    else dom.removeAttribute(attributeName(name));
  } else if (value === null || value === undefined || value === false) {
    if (name.startsWith('aria-') && value === false) dom.setAttribute(name, 'false');
    else dom.removeAttribute(attributeName(name));
  } else {
    dom.setAttribute(attributeName(name), String(value));
  }
}

export function createDOM(vnode, document = globalThis.document, parentNamespace) {
  if (vnode.type === TEXT) return document.createTextNode(vnode.props.nodeValue);
  if (vnode.type === COMMENT) return document.createComment(vnode.props.nodeValue);
  assertUniqueKeys(vnode.children);
  const namespace =
    vnode.namespace ?? (vnode.type === 'svg' ? 'http://www.w3.org/2000/svg' : parentNamespace);
  const dom =
    namespace && namespace !== 'http://www.w3.org/1999/xhtml'
      ? document.createElementNS(namespace, vnode.type)
      : document.createElement(vnode.type);
  for (const [name, value] of Object.entries(vnode.props))
    if (name !== 'value') setProp(dom, name, undefined, value);
  const childNS = vnode.type === 'foreignObject' ? 'http://www.w3.org/1999/xhtml' : namespace;
  for (const child of vnode.children) dom.appendChild(createDOM(child, document, childNS));
  if ('value' in vnode.props) setProp(dom, 'value', undefined, vnode.props.value);
  return dom;
}
