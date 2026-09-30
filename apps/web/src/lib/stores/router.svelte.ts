export type RouteName = 'cases' | 'case' | 'insights' | 'updates' | 'tools' | 'settings' | 'design';

export interface Route {
  name: RouteName;
  path: string;
  /** Case id for the case route. */
  id?: string;
}

const PATHS: Record<string, RouteName> = {
  '/cases': 'cases',
  '/insights': 'insights',
  '/updates': 'updates',
  '/tools': 'tools',
  '/settings': 'settings',
  '/settings/design': 'design',
};

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/cases';
  const name = PATHS[path];
  if (name) return { name, path };
  const m = /^\/case\/([A-Za-z0-9_-]+)$/.exec(path);
  if (m?.[1]) return { name: 'case', path, id: m[1] };
  return { name: 'cases', path: '/cases' };
}

export function casePath(id: string): string {
  return `#/case/${id}`;
}

export const router: { route: Route } = $state({ route: parseHash(location.hash) });

export function startRouter(): () => void {
  const onChange = () => {
    router.route = parseHash(location.hash);
  };
  addEventListener('hashchange', onChange);
  return () => removeEventListener('hashchange', onChange);
}

export function navigate(path: string): void {
  location.hash = path;
}
