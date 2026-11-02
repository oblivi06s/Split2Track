import { Money } from '../services/Money.js';

/**
 * Base class for every screen. Each screen extends this and overrides
 * `render()`. The App calls `render()` again when data changes.
 */
export class View {
  /**
   * @param {import('./App.js').App} app
   * @param {Object<string,string>} params values from the URL, like the group id
   * @param {URLSearchParams} query values after "?" in the URL
   */
  constructor(app, params = {}, query = new URLSearchParams()) {
    this.app = app;
    this.store = app.store;
    this.params = params;
    this.query = query;
  }

  /** Text in the top bar. */
  get title() {
    return 'Split2Track';
  }

  /** Which bottom tab to highlight. */
  get tab() {
    return null;
  }

  /** Where the back arrow goes. null = no back arrow. */
  get backHref() {
    return null;
  }

  /**
   * Should this screen redraw when data changes?
   * Forms return false so typing is never wiped out.
   */
  get live() {
    return true;
  }

  /** Forms hide the bottom tabs so the keyboard and Save button have room. */
  get hideTabs() {
    return false;
  }

  /** Buttons for the right side of the top bar. */
  actions() {
    return [];
  }

  /** @returns {HTMLElement} */
  render() {
    throw new Error(`${this.constructor.name} must implement render()`);
  }

  /** Called before the screen is replaced. */
  destroy() {}

  /** Format cents in the user's currency. */
  money(cents) {
    return Money.format(cents, this.store.currency);
  }

  /** Redraw this screen. */
  refresh() {
    this.app.renderCurrent();
  }

  go(path) {
    this.app.router.go(path);
  }
}

/** Shown when a link points to something that no longer exists. */
export class NotFoundView extends View {
  get title() {
    return 'Not found';
  }

  get backHref() {
    return '#/groups';
  }

  render() {
    const el = document.createElement('div');
    el.className = 'empty';
    el.textContent = 'This page or item does not exist anymore.';
    return el;
  }
}
