import { h } from '../dom.js';
import { View } from '../View.js';
import { field, textInput, segmented, button, errorText } from '../forms.js';
import { toast } from '../components.js';

export const MODE_KEY = 'split2track:mode';

/** Sign in or create an account (cloud mode). */
export class AuthView extends View {
  constructor(...args) {
    super(...args);
    this.tabMode = 'signin';
    this.email = '';
    this.password = '';
    this.name = '';
    this.message = '';
  }

  get title() {
    return this.tabMode === 'signin' ? 'Sign in' : 'Create account';
  }

  get live() {
    return false;
  }

  render() {
    const service = this.app.service;
    const isSignUp = this.tabMode === 'signup';
    const error = errorText();
    const joining = location.hash.startsWith('#/join/');

    const email = textInput({ type: 'email', value: this.email, placeholder: 'you@example.com', maxlength: 200, onInput: (v) => (this.email = v.trim()) });
    email.setAttribute('autocomplete', 'email');
    const password = textInput({ type: 'password', value: this.password, placeholder: 'At least 6 characters', maxlength: 100, onInput: (v) => (this.password = v) });
    password.setAttribute('autocomplete', isSignUp ? 'new-password' : 'current-password');
    const submitBtn = button(isSignUp ? 'Create account' : 'Sign in', null, { type: 'submit', block: true });

    const submit = async (event) => {
      event.preventDefault();
      error.textContent = '';
      if (isSignUp && !this.name.trim()) {
        error.textContent = 'Please enter your name.';
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Please wait…';
      try {
        const { session } = isSignUp
          ? await service.signUp(this.email, this.password, this.name.trim())
          : await service.signIn(this.email, this.password);
        if (session) {
          location.reload();
          return;
        }
        this.message = `We sent a confirmation link to ${this.email}. Open it, then come back and sign in.`;
        this.tabMode = 'signin';
        this.refresh();
      } catch (e) {
        error.textContent = AuthView.friendly(e);
        submitBtn.disabled = false;
        submitBtn.textContent = isSignUp ? 'Create account' : 'Sign in';
      }
    };

    const forgot = async () => {
      if (!this.email) {
        error.textContent = 'Type your email first, then tap "Forgot password?".';
        return;
      }
      try {
        await service.resetPassword(this.email);
        toast('Check your email for a reset link');
      } catch (e) {
        error.textContent = AuthView.friendly(e);
      }
    };

    return h(
      'form',
      { class: 'onboarding', onSubmit: submit, novalidate: true },
      h('div', { class: 'hero-logo', 'aria-hidden': 'true' }, '💸'),
      h('h2', { class: 'hero-title' }, 'Split2Track'),
      h(
        'p',
        { class: 'muted center' },
        joining ? 'Sign in or create an account to join the group.' : 'Share groups with friends. Everyone sees the same expenses.',
      ),
      this.message ? h('div', { class: 'notice', role: 'status' }, this.message) : null,
      segmented(
        [
          { value: 'signin', label: 'Sign in' },
          { value: 'signup', label: 'Create account' },
        ],
        this.tabMode,
        (value) => {
          this.tabMode = value;
          this.message = '';
          this.refresh();
        },
        'Account',
      ),
      h(
        'div',
        { class: 'card pad' },
        isSignUp ? field('Your name', textInput({ value: this.name, placeholder: 'e.g. John', onInput: (v) => (this.name = v) })) : null,
        field('Email', email),
        field('Password', password),
        error,
        submitBtn,
        isSignUp ? null : h('button', { type: 'button', class: 'link-btn', onClick: forgot }, 'Forgot password?'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'link-btn muted',
          onClick: () => {
            try {
              localStorage.setItem(MODE_KEY, 'local');
            } catch {
              /* ignore */
            }
            location.hash = '';
            location.reload();
          },
        },
        'Use without an account (this device only)',
      ),
    );
  }

  static friendly(error) {
    const message = String(error?.message ?? error);
    if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
    if (/already registered/i.test(message)) return 'This email already has an account. Try signing in.';
    if (/email not confirmed/i.test(message)) return 'Please confirm your email first. Check your inbox.';
    if (/rate limit/i.test(message)) return 'Too many tries. Please wait a few minutes.';
    if (/failed to fetch|network/i.test(message)) return 'No internet connection.';
    return message;
  }
}

/** Shown while the first download from the server is running. */
export class LoadingView extends View {
  get title() {
    return 'Split2Track';
  }

  render() {
    const offline = this.app.sync?.status === 'offline';
    return h(
      'div',
      { class: 'empty' },
      h('div', { class: 'empty-icon', 'aria-hidden': 'true' }, offline ? '📡' : '⏳'),
      h('h3', {}, offline ? 'You’re offline' : 'Loading your data…'),
      h('p', { class: 'muted' }, offline ? 'Connect to the internet to load your account the first time.' : 'This only takes a moment.'),
    );
  }
}
