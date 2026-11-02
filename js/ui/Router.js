/**
 * Hash router: "#/groups/abc" -> GroupDetailView with { id: 'abc' }.
 * Hash URLs work on GitHub Pages with no server setup.
 */
export class Router {
  /** @param {{path: string, view: Function}[]} routes */
  constructor(routes, fallback) {
    this.routes = routes.map((route) => ({ ...route, parts: Router.#split(route.path) }));
    this.fallback = fallback;
  }

  /** Finds the matching route for a hash like "#/groups/abc?x=1". */
  resolve(hash) {
    const [pathPart, queryPart = ''] = hash.replace(/^#/, '').split('?');
    const parts = Router.#split(pathPart || '/');
    const query = new URLSearchParams(queryPart);

    for (const route of this.routes) {
      const params = Router.#match(route.parts, parts);
      if (params) return { View: route.view, params, query };
    }
    return { View: this.fallback, params: {}, query };
  }

  start(onChange) {
    window.addEventListener('hashchange', () => onChange(this.resolve(location.hash)));
    onChange(this.resolve(location.hash));
  }

  go(path) {
    const hash = path.startsWith('#') ? path : `#${path}`;
    if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else location.hash = hash;
  }

  static #split(path) {
    return path.split('/').filter(Boolean);
  }

  static #match(pattern, parts) {
    if (pattern.length !== parts.length) return null;
    const params = {};
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (pattern[i] !== parts[i]) return null;
    }
    return params;
  }
}
