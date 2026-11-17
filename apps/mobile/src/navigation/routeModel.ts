import type { Route, RouteName } from '../types';
const publicRoutes: RouteName[] = ['login', 'register', 'forgotPassword'];
export function resolveRoute(hash: string, authenticated: boolean, allowed: readonly RouteName[]): Route {
  const [, name, rawId] = hash.split('/');
  if (!allowed.includes(name as RouteName)) return { name: authenticated ? 'home' : 'login' };
  if (!authenticated && !publicRoutes.includes(name as RouteName)) return { name: 'login' };
  if (authenticated && publicRoutes.includes(name as RouteName)) return { name: 'home' };
  try { return { name: name as RouteName, ...(rawId ? { id: decodeURIComponent(rawId) } : {}) }; }
  catch { return { name: authenticated ? 'home' : 'login' }; }
}
