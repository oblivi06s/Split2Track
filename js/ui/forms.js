import { h } from './dom.js';

/** Form building blocks. */

let fieldCounter = 0;

/** Label + control. Gives the control an id so the label is linked. */
export function field(label, control, hint = null) {
  const id = control.id || `f${++fieldCounter}`;
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
}

export function textInput({ value = '', placeholder = '', onInput, inputmode, maxlength = 80, type = 'text', autofocus } = {}) {
  return h('input', {
    type,
    class: 'input',
    value,
    placeholder,
    inputmode,
    maxlength,
    autocomplete: 'off',
    autofocus,
    onInput: onInput ? (e) => onInput(e.target.value) : null,
  });
}

/** options: [{value, label}] */
export function selectInput(options, value, onChange) {
  return h(
    'select',
    { class: 'input', onChange: (e) => onChange(e.target.value) },
    options.map((opt) => h('option', { value: opt.value, selected: opt.value === value }, opt.label)),
  );
}

/** Row of buttons where one is selected (like iOS segmented control). */
export function segmented(options, value, onChange, label = 'Options') {
  return h(
    'div',
    { class: 'segmented', role: 'tablist', 'aria-label': label },
    options.map((opt) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: opt.value === value ? 'active' : '',
          'aria-selected': opt.value === value ? 'true' : 'false',
          onClick: () => onChange(opt.value),
        },
        opt.label,
      ),
    ),
  );
}

export function button(label, onClick, { kind = 'primary', type = 'button', disabled = false, block = false } = {}) {
  return h('button', { type, class: `btn ${kind} ${block ? 'block' : ''}`, onClick, disabled }, label);
}

export function linkButton(label, href, { kind = 'primary', block = false } = {}) {
  return h('a', { class: `btn ${kind} ${block ? 'block' : ''}`, href }, label);
}

export function errorText() {
  return h('div', { class: 'form-error', role: 'alert' });
}
