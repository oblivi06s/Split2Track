/**
 * Tiny helper to build HTML elements in JavaScript.
 *   h('button', { class: 'btn', onClick: save }, 'Save')
 * Text is always added as text (never as HTML), so names like
 * "<script>" can't break the page.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    }
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (['value', 'checked', 'disabled', 'selected', 'hidden'].includes(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of [children].flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

/** "2026-11-02" -> "Nov 2" (or "Nov 2, 2025" if not this year). */
export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const sameYear = y === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** "2026-11-02" -> "November 2026" */
export function formatMonth(iso) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
