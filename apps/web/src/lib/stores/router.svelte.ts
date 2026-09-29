export type RouteName = 'cases' | 'insights' | 'updates' | 'tools' | 'settings' | 'design';

export interface Route {
  name: RouteName;
  path: string;
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
  return name ? { name, path } : { name: 'cases', path: '/cases' };
}

export function href(path: string): string {
  return `#${path}`;
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
