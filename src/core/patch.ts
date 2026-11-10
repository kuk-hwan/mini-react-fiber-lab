import { createDOM, readDOMProp, setProp } from './dom.ts';
import type { DiffPlan, OperationType, PatchInspection, PatchOperation } from './types.ts';

function describeNode(node: Node): string | null {
  return node.nodeType === 1 ? (node as Element).outerHTML : node.nodeValue;
}

/** Snapshot child references BEFORE mutations. Keyed moves preserve DOM identity. */
export function patch(
  dom: Node | null,
  plan: DiffPlan,
  container: Element,
  operations: PatchOperation[] = [],
  inspect?: (change: PatchInspection) => void,
): Node | null {
  const record = (
    type: OperationType,
    detail: string,
    target: Node,
    before: string | null,
    after: string | null,
    path = plan.path,
  ): void => {
    const operation = { type, path, detail };
    operations.push(operation);
    inspect?.({ ...operation, target, before, after });
  };
  if (plan.kind === 'NONE') return dom;
  if (plan.kind === 'CREATE') {
    const node = createDOM(plan.next, container.ownerDocument, container.namespaceURI);
    container.appendChild(node);
    record('CREATE', String(plan.next.type), node, null, inspect ? describeNode(node) : null);
    return node;
  }
  if (!dom) throw new Error('Patch 대상 DOM이 없습니다.');
  if (plan.kind === 'REMOVE') {
    const before = inspect ? describeNode(dom) : null;
    container.removeChild(dom);
    record('REMOVE', String(plan.previous.type), container, before, null);
    return null;
  }
  if (plan.kind === 'REPLACE') {
    const before = inspect ? describeNode(dom) : null;
    const node = createDOM(plan.next, container.ownerDocument, container.namespaceURI);
    container.replaceChild(node, dom);
    record(
      'REPLACE',
      `${plan.previous.type} → ${plan.next.type}`,
      node,
      before,
      inspect ? describeNode(node) : null,
    );
    return node;
  }
  if (plan.kind === 'TEXT') {
    const before = dom.nodeValue;
    dom.nodeValue = String(plan.next.props.nodeValue);
    record('TEXT', dom.nodeValue, dom, before, dom.nodeValue);
    return dom;
  }
  if (dom.nodeType !== 1) throw new TypeError('속성 Patch에는 Element가 필요합니다.');
  const element = dom as Element;
  const patchProp = (name: string, previous: unknown, value: unknown): void => {
    const before = inspect ? readDOMProp(element, name, previous) : null;
    setProp(element, name, previous, value);
    record('PROPS', name, element, before, inspect ? readDOMProp(element, name, value) : null);
  };
  // Defer value until children are committed (select/option semantics).
  for (const prop of plan.props.filter((prop) => prop.name !== 'value')) {
    patchProp(prop.name, prop.previous, prop.value);
  }
  const oldChildren = [...dom.childNodes];
  for (const index of plan.removed) {
    const before = inspect ? describeNode(oldChildren[index]) : null;
    oldChildren[index].remove();
    record(
      'REMOVE',
      String(plan.previous.children[index].type),
      element,
      before,
      null,
      `${plan.path}.${index}`,
    );
  }
  plan.children.forEach(({ oldIndex, plan: childPlan }, index) => {
    const node = patch(
      oldIndex === -1 ? null : oldChildren[oldIndex],
      childPlan,
      element,
      operations,
      inspect,
    );
    if (node && dom.childNodes[index] !== node) {
      dom.insertBefore(node, dom.childNodes[index] ?? null);
      if (oldIndex !== -1)
        record(
          'MOVE',
          `${oldIndex} → ${index}`,
          node,
          `자식 노드 인덱스 ${oldIndex}`,
          `자식 노드 인덱스 ${index}`,
          childPlan.path,
        );
    }
  });
  for (const prop of plan.props.filter((prop) => prop.name === 'value')) {
    patchProp(prop.name, prop.previous, prop.value);
  }
  for (const name of ['value', 'checked']) {
    if (
      name in plan.next.props &&
      name in element &&
      String(Reflect.get(element, name)) !== String(plan.next.props[name])
    ) {
      patchProp(name, plan.previous.props[name], plan.next.props[name]);
    }
  }
  return dom;
}
