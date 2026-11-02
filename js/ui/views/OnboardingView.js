import { h } from '../dom.js';
import { View } from '../View.js';
import { field, textInput, selectInput, button, errorText } from '../forms.js';
import { Money } from '../../services/Money.js';

/** First screen: asks for your name and currency. */
export class OnboardingView extends View {
  get title() {
    return 'Welcome';
  }

  get live() {
    return false;
  }

  render() {
    let name = this.app.user?.user_metadata?.name ?? '';
    let currency = this.store.currency;
    const error = errorText();

    const submit = (event) => {
      event.preventDefault();
      try {
        this.store.setCurrency(currency);
        this.store.createMe(name);
        // Continue to where the user was going (for example, an invite link).
        this.app.reshow();
      } catch (e) {
        error.textContent = e.message;
      }
    };

    return h(
      'form',
      { class: 'onboarding', onSubmit: submit },
      h('div', { class: 'hero-logo', 'aria-hidden': 'true' }, '💸'),
      h('h2', { class: 'hero-title' }, 'Split2Track'),
      h('p', { class: 'muted center' }, 'Split bills with friends.', h('br'), 'Track what every expense was for.'),
      h(
        'div',
        { class: 'card pad' },
        field('Your name', textInput({ value: name, placeholder: 'e.g. John', onInput: (v) => (name = v), autofocus: true })),
        field(
          'Currency',
          selectInput(
            Money.CURRENCIES.map((c) => ({ value: c, label: `${c} (${Money.symbol(c)})` })),
            currency,
            (v) => (currency = v),
          ),
        ),
        error,
        button('Get started', null, { type: 'submit', block: true }),
      ),
      h(
        'p',
        { class: 'muted small center' },
        this.app.mode === 'cloud' ? 'This is the name your friends will see.' : 'Your data stays on this device. No sign-up needed.',
      ),
    );
  }
}
