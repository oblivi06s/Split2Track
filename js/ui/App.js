import { h, clear, append } from './dom.js';
import { Router } from './Router.js';
import { NotFoundView } from './View.js';
import { OnboardingView } from './views/OnboardingView.js';
import { GroupsView } from './views/GroupsView.js';
import { GroupFormView } from './views/GroupFormView.js';
import { GroupDetailView } from './views/GroupDetailView.js';
import { FriendsView } from './views/FriendsView.js';
import { FriendDetailView } from './views/FriendDetailView.js';
import { ExpenseFormView } from './views/ExpenseFormView.js';
import { ExpenseDetailView } from './views/ExpenseDetailView.js';
import { SettleUpView } from './views/SettleUpView.js';
import { ActivityView } from './views/ActivityView.js';
import { AccountView } from './views/AccountView.js';

const ROUTES = [
  { path: '/', view: GroupsView },
  { path: '/groups', view: GroupsView },
  { path: '/groups/new', view: GroupFormView },
  { path: '/groups/:id', view: GroupDetailView },
  { path: '/groups/:id/edit', view: GroupFormView },
  { path: '/friends', view: FriendsView },
  { path: '/friends/:id', view: FriendDetailView },
  { path: '/expense/new', view: ExpenseFormView },
  { path: '/expense/:id', view: ExpenseDetailView },
  { path: '/expense/:id/edit', view: ExpenseFormView },
  { path: '/settle', view: SettleUpView },
  { path: '/activity', view: ActivityView },
  { path: '/account', view: AccountView },
];

const TABS = [
  { id: 'groups', label: 'Groups', icon: '👥', href: '#/groups' },
  { id: 'friends', label: 'Friends', icon: '🙋', href: '#/friends' },
  { id: 'activity', label: 'Activity', icon: '🧾', href: '#/activity' },
  { id: 'account', label: 'Account', icon: '⚙️', href: '#/account' },
];

/** Connects the store, router, and screens. Owns the page layout. */
export class App {
  /** @param {HTMLElement} root @param {import('../storage/AppStore.js').AppStore} store */
  constructor(root, store) {
    this.root = root;
    this.store = store;
    this.router = new Router(ROUTES, NotFoundView);
    this.current = null;
    this.#buildShell();
  }

  start() {
    this.store.subscribe(() => {
      if (this.current?.live) this.renderCurrent();
    });
    this.router.start((match) => this.#show(match));
  }

  #buildShell() {
    this.backBtn = h('a', { class: 'icon-btn back', 'aria-label': 'Back', hidden: true }, '‹');
    this.titleEl = h('h1', { class: 'top-title' });
    this.actionsEl = h('div', { class: 'top-actions' });
    this.viewEl = h('main', { class: 'view', id: 'main' });
    this.tabLinks = TABS.map((tab) =>
      h('a', { class: 'tab', href: tab.href, dataset: { tab: tab.id } }, h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, tab.icon), h('span', {}, tab.label)),
    );
    this.tabBar = h('nav', { class: 'tabbar', 'aria-label': 'Main' }, this.tabLinks);

    clear(this.root);
    append(this.root, [
      h('header', { class: 'topbar' }, this.backBtn, this.titleEl, this.actionsEl),
      this.viewEl,
      this.tabBar,
    ]);
  }

  #show({ View, params, query }) {
    this.current?.destroy();
    // No profile yet? Always show the welcome screen first.
    const ViewClass = this.store.me ? View : OnboardingView;
    this.current = new ViewClass(this, params, query);
    this.renderCurrent();
    window.scrollTo(0, 0);
  }

  renderCurrent() {
    const view = this.current;
    if (!view) return;
    const scrollY = window.scrollY;

    let body;
    try {
      body = view.render();
    } catch (error) {
      console.error(error);
      body = h('div', { class: 'empty' }, h('h3', {}, 'Something went wrong'), h('p', { class: 'muted' }, error.message));
    }

    this.titleEl.textContent = view.title;
    document.title = view.title === 'Split2Track' ? 'Split2Track' : `${view.title} · Split2Track`;
    this.backBtn.hidden = !view.backHref;
    if (view.backHref) this.backBtn.setAttribute('href', view.backHref);
    clear(this.actionsEl);
    append(this.actionsEl, view.actions());

    const showTabs = Boolean(this.store.me);
    this.tabBar.hidden = !showTabs;
    this.root.classList.toggle('no-tabs', !showTabs);
    for (const link of this.tabLinks) {
      const active = link.dataset.tab === view.tab;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }

    clear(this.viewEl);
    this.viewEl.append(body);
    window.scrollTo(0, scrollY);
  }
}
