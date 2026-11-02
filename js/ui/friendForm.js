import { h } from './dom.js';
import { textInput, button } from './forms.js';
import { toast } from './components.js';

/**
 * Reusable "add a friend" fields. In cloud mode it also asks for an email:
 * the friend then sees the group as soon as they sign in with that email.
 *
 * @param {{store: object, cloud: boolean, onAdded: (friend: object) => void, compact?: boolean}} options
 */
export function addFriendFields({ store, cloud, onAdded, compact = false }) {
  const name = textInput({ placeholder: compact ? 'Add a new friend' : 'Friend’s name' });
  name.setAttribute('aria-label', 'New friend name');
  const email = cloud ? textInput({ type: 'email', placeholder: 'Their email (optional)', maxlength: 254 }) : null;
  if (email) {
    email.setAttribute('aria-label', 'New friend email');
    email.setAttribute('autocomplete', 'off');
    email.setAttribute('inputmode', 'email');
  }

  const add = () => {
    try {
      const friend = store.addFriend(name.value, email?.value);
      name.value = '';
      if (email) email.value = '';
      toast(friend.email ? `${friend.name} added. They’ll see your groups when they sign in.` : `${friend.name} added`);
      onAdded(friend);
    } catch (e) {
      toast(e.message);
    }
  };
  for (const input of [name, email].filter(Boolean)) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        add();
      }
    });
  }

  return h(
    'div',
    { class: `add-friend ${cloud ? 'with-email' : ''}` },
    h('div', { class: 'add-friend-inputs' }, name, email),
    button(compact ? 'Add' : 'Add friend', add, { kind: compact ? 'secondary' : 'primary' }),
    cloud
      ? h('p', { class: 'hint add-friend-hint' }, 'Add their email so this shows up in their account when they sign in or sign up.')
      : null,
  );
}
