import { useSyncExternalStore } from 'react';

export type Route = { name: 'list' } | { name: 'editor'; mapId: string };

export function parseHash(hash: string): Route {
  const m = /^#\/maps\/([^/?#]+)/.exec(hash);
  return m ? { name: 'editor', mapId: decodeURIComponent(m[1]) } : { name: 'list' };
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useHashLocation(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}

export const navigate = {
  toList: () => (window.location.hash = '#/'),
  toEditor: (mapId: string) => (window.location.hash = `#/maps/${encodeURIComponent(mapId)}`),
};
