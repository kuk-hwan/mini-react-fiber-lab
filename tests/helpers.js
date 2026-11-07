import { JSDOM } from 'jsdom';
export function environment(html = '<div id="root"></div>') {
  const window = new JSDOM(html, { url: 'http://localhost/' }).window;
  return { window, document: window.document, container: window.document.querySelector('#root') };
}
