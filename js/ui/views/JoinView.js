import { h, clear, append } from '../dom.js';
import { View } from '../View.js';
import { avatar, emptyState, toast } from '../components.js';
import { button, linkButton, errorText } from '../forms.js';
import { MODE_KEY } from './AuthView.js';

/** Opened from an invite link: #/join/CODE */
export class JoinView extends View {
  get title() {
    return 'Join group';
  }

  get backHref() {
    return '#/groups';
  }

  get live() {
    return false;
  }

  render() {
    if (this.app.mode !== 'cloud') {
      return emptyState(
        '🔗',
        'Sign in to join this group',
        'Group invites need an account so everyone can see the same expenses.',
        button('Sign in or create account', () => {
          try {
            localStorage.removeItem(MODE_KEY);
          } catch {
            /* ignore */
          }
          location.reload();
        }),
      );
    }
    const box = h('div', {}, emptyState('⏳', 'Opening invite…', 'Just a moment.'));
    this.#load(box);
    return box;
  }

  async #load(box) {
    const { service, sync } = this.app;
    let preview;
    try {
      await sync.push(); // make sure your profile is on the server first
      preview = await service.invitePreview(this.params.code);
    } catch (e) {
      this.#show(box, emptyState('⚠️', 'Could not open the invite', e.message, linkButton('Go to groups', '#/groups')));
      return;
    }
    if (!preview) {
      this.#show(box, emptyState('🤷', 'Invite link not valid', 'Ask your friend to send the link again.', linkButton('Go to groups', '#/groups')));
      return;
    }
    if (preview.already_member) {
      await sync.refresh({ force: true });
      this.#show(box, emptyState(preview.emoji, `You’re already in ${preview.name}`, 'Nothing else to do.', linkButton('Open group', `#/groups/${preview.id}`)));
      return;
    }

    let claimId = '';
    const error = errorText();
    const unclaimed = preview.members.filter((m) => !m.claimed);
    const option = (value, label, sub, person) =>
      h(
        'label',
        { class: 'row tappable check-row' },
        person ? avatar(person, 32) : h('span', { class: 'emoji-tile', 'aria-hidden': 'true' }, '🙋'),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, label), sub ? h('div', { class: 'row-sub' }, sub) : null),
        h('input', { type: 'radio', name: 'claim', value, checked: value === claimId, onChange: () => (claimId = value) }),
      );

    const joinBtn = button(`Join ${preview.name}`, null, { type: 'submit', block: true });
    const join = async (event) => {
      event.preventDefault();
      joinBtn.disabled = true;
      joinBtn.textContent = 'Joining…';
      try {
        const groupId = await service.joinGroup(this.params.code, claimId || null);
        await sync.refresh({ force: true });
        toast(`Welcome to ${preview.name}!`);
        this.go(`#/groups/${groupId}`);
      } catch (e) {
        error.textContent = e.message;
        joinBtn.disabled = false;
        joinBtn.textContent = `Join ${preview.name}`;
      }
    };

    const nameOf = (m) => ({ name: m.name, initials: m.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase() });

    this.#show(
      box,
      h(
        'form',
        { onSubmit: join },
        h(
          'div',
          { class: 'card pad group-head' },
          h('span', { class: 'emoji-tile big', 'aria-hidden': 'true' }, preview.emoji),
          h('div', {}, h('h2', { class: 'group-name' }, preview.name), h('div', { class: 'muted small' }, `${preview.members.length} members`)),
        ),
        unclaimed.length
          ? h(
              'section',
              { class: 'section' },
              h('h2', { class: 'section-title' }, 'Which one are you?'),
              h(
                'div',
                { class: 'card' },
                unclaimed.map((m) => option(m.id, m.name, 'That’s me. Use my expenses here.', nameOf(m))),
                option('', 'I’m not on this list', 'Join as a new member'),
              ),
              h('p', { class: 'muted small section' }, 'If a friend already added you, pick your name so their expenses with you carry over.'),
            )
          : null,
        error,
        h('div', { class: 'section' }, joinBtn),
      ),
    );
  }

  #show(box, content) {
    clear(box);
    append(box, content);
  }
}
