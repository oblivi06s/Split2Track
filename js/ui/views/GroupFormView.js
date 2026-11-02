import { h, clear, append } from '../dom.js';
import { View } from '../View.js';
import { field, textInput, button, errorText } from '../forms.js';
import { avatar, toast } from '../components.js';
import { addFriendFields } from '../friendForm.js';

const EMOJIS = ['✈️', '🏠', '🍽️', '🎉', '🏖️', '🏔️', '🚗', '💼', '🎓', '⚽️', '🎂', '🛒'];

/** Create a new group, or edit an existing one (name, emoji, members). */
export class GroupFormView extends View {
  constructor(...args) {
    super(...args);
    this.group = this.params.id ? this.store.getGroup(this.params.id) : null;
    this.name = this.group?.name ?? '';
    this.emoji = this.group?.emoji ?? EMOJIS[0];
    this.selected = new Set(this.group?.memberIds ?? []);
    this.locked = this.group ? this.store.lockedMemberIds(this.group.id) : new Set();
  }

  get title() {
    return this.group ? 'Edit group' : 'New group';
  }

  get backHref() {
    return this.group ? `#/groups/${this.group.id}` : '#/groups';
  }

  get tab() {
    return 'groups';
  }

  get live() {
    return false;
  }

  get hideTabs() {
    return true;
  }

  render() {
    if (this.params.id && !this.group) return h('div', { class: 'empty' }, 'Group not found.');

    const error = errorText();
    const emojiRow = h('div', { class: 'emoji-row', role: 'radiogroup', 'aria-label': 'Group icon' });
    const drawEmojis = () => {
      clear(emojiRow);
      append(
        emojiRow,
        EMOJIS.map((emoji) =>
          h(
            'button',
            {
              type: 'button',
              role: 'radio',
              'aria-checked': emoji === this.emoji ? 'true' : 'false',
              class: `emoji-btn ${emoji === this.emoji ? 'active' : ''}`,
              onClick: () => {
                this.emoji = emoji;
                drawEmojis();
              },
            },
            emoji,
          ),
        ),
      );
    };
    drawEmojis();

    const members = h('div', { class: 'card' });
    const drawMembers = () => {
      clear(members);
      append(members, h('div', { class: 'row' }, avatar(this.store.me, 32), h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, 'You')), h('span', { class: 'muted small' }, 'always in')));
      for (const friend of this.store.friends()) {
        const isLocked = this.locked.has(friend.id);
        const checkbox = h('input', {
          type: 'checkbox',
          checked: this.selected.has(friend.id),
          disabled: isLocked,
          onChange: (e) => (e.target.checked ? this.selected.add(friend.id) : this.selected.delete(friend.id)),
        });
        append(
          members,
          h(
            'label',
            { class: 'row tappable check-row' },
            avatar(friend, 32),
            h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, friend.name), isLocked ? h('div', { class: 'row-sub' }, 'Has expenses here') : null),
            checkbox,
          ),
        );
      }
      append(members, this.#newFriendRow(drawMembers));
    };
    drawMembers();

    const save = (event) => {
      event.preventDefault();
      try {
        if (this.group) {
          this.store.updateGroup(this.group.id, { name: this.name, emoji: this.emoji, memberIds: [...this.selected] });
          this.go(`#/groups/${this.group.id}`);
        } else {
          const group = this.store.createGroup({ name: this.name, emoji: this.emoji, memberIds: [...this.selected] });
          toast('Group created');
          this.go(`#/groups/${group.id}`);
        }
      } catch (e) {
        error.textContent = e.message;
      }
    };

    return h(
      'form',
      { onSubmit: save },
      h(
        'div',
        { class: 'card pad' },
        field('Group name', textInput({ value: this.name, placeholder: 'e.g. Baguio Trip', onInput: (v) => (this.name = v), autofocus: !this.group })),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Icon'), emojiRow),
      ),
      h('section', { class: 'section' }, h('h2', { class: 'section-title' }, 'Members'), members),
      error,
      h('div', { class: 'sticky-actions' }, button(this.group ? 'Save changes' : 'Create group', null, { type: 'submit', block: true })),
    );
  }

  /** Inline "add a new friend" fields. */
  #newFriendRow(redraw) {
    return h(
      'div',
      { class: 'row add-row-wrap' },
      addFriendFields({
        store: this.store,
        cloud: this.app.mode === 'cloud',
        compact: true,
        onAdded: (friend) => {
          this.selected.add(friend.id);
          redraw();
        },
      }),
    );
  }
}
