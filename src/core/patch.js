import { createDOM, setProp } from './dom.js';

/** Snapshot child references BEFORE mutations. Keyed moves preserve DOM identity. */
export function patch(dom, plan, container, operations = []) {
  const record = (type, detail = '') => operations.push({ type, path: plan.path, detail });
  if (plan.kind === 'NONE') return dom;
  if (plan.kind === 'CREATE') {
    const node = createDOM(plan.next, container.ownerDocument, container.namespaceURI);
    container.appendChild(node);
    record('CREATE', plan.next.type);
    return node;
  }
  if (plan.kind === 'REMOVE') {
    dom.remove();
    record('REMOVE', plan.previous.type);
    return null;
  }
  if (plan.kind === 'REPLACE') {
    const node = createDOM(plan.next, container.ownerDocument, container.namespaceURI);
    container.replaceChild(node, dom);
    record('REPLACE', `${plan.previous.type} → ${plan.next.type}`);
    return node;
  }
  if (plan.kind === 'TEXT') {
    dom.nodeValue = plan.next.props.nodeValue;
    record('TEXT', plan.next.props.nodeValue);
    return dom;
  }
  // Defer value until children are committed (select/option semantics).
  for (const prop of plan.props.filter((prop) => prop.name !== 'value')) {
    setProp(dom, prop.name, prop.previous, prop.value);
    record('PROPS', prop.name);
  }
  const oldChildren = [...dom.childNodes];
  for (const index of plan.removed) {
    oldChildren[index].remove();
    operations.push({
      type: 'REMOVE',
      path: `${plan.path}.${index}`,
      detail: plan.previous.children[index].type,
    });
  }
  plan.children.forEach(({ oldIndex, plan: childPlan }, index) => {
    const node = patch(oldIndex === -1 ? null : oldChildren[oldIndex], childPlan, dom, operations);
    if (dom.childNodes[index] !== node) {
      dom.insertBefore(node, dom.childNodes[index] ?? null);
      if (oldIndex !== -1)
        operations.push({ type: 'MOVE', path: childPlan.path, detail: `${oldIndex} → ${index}` });
    }
  });
  for (const prop of plan.props.filter((prop) => prop.name === 'value')) {
    setProp(dom, prop.name, prop.previous, prop.value);
    record('PROPS', prop.name);
  }
  // Keep controlled inputs coherent even if the user edited the live property.
  for (const name of ['value', 'checked']) {
    if (
      name in plan.next.props &&
      name in dom &&
      String(dom[name]) !== String(plan.next.props[name])
    ) {
      setProp(dom, name, plan.previous.props[name], plan.next.props[name]);
      record('PROPS', name);
    }
  }
  return dom;
}
