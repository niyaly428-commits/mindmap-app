import { parseHash, useHashLocation } from './lib/router';
import { MapListPage } from './features/list/MapListPage';
import { EditorPage } from './features/editor/EditorPage';

export function App() {
  const route = parseHash(useHashLocation());
  return route.name === 'editor' ? <EditorPage key={route.mapId} mapId={route.mapId} /> : <MapListPage />;
}
