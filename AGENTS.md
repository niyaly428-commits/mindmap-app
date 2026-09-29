# mindmap-app

Personal XMind-like mind map + task app. Browser-only (no server/login). This project is independent of the user's other projects.

## Commands
- `npm run dev` — dev server (http://localhost:5173)
- `npm test` — unit tests (Vitest; IndexedDB via fake-indexeddb)
- `npm run test:e2e` — E2E (Playwright, uses installed Microsoft Edge via `channel: 'msedge'`, port 5188)
- `npm run typecheck` / `npm run build`
- `npm run deploy` — deploy to Vercel production (CLI already logged in; project `mindmap-app`, URL https://mindmap-app-umber.vercel.app). Verify with `E2E_BASE_URL=https://mindmap-app-umber.vercel.app npm run test:e2e`.
- Install deps with `npm install --before=<date 7+ days ago>` (exact versions pinned via .npmrc).

## Architecture
- Vite + React 19 + TypeScript, `@xyflow/react` (canvas: zoom/pan/drag), `zustand` (editor state), `dexie` (IndexedDB).
- `src/model/` — pure document logic: `types.ts` (MindMapDoc/MindNode, reserved optional fields for future features), `tree.ts` (immutable ops + checkbox propagation), `layout.ts` (left/right mind-map auto layout).
- `src/store/editorStore.ts` — document + selection + snapshot Undo/Redo. `autosave.ts` saves 300ms after edits.
- `src/db/` — Dexie DB (`maps` table, version 1). Add future tables (e.g. `assets` for image Blobs) with `this.version(2)`.
- `src/model/nextDay.ts` — "次の日のタスクを作成": next-day title + carry over unchecked main topics (whole subtree).
- Map title and root topic text are always identical (`tree.setTitle` / `setText(root)`); `titleDraft` in the store mirrors typing live.
- Layout uses real rendered sizes (React Flow `dimensions` changes → `layoutMap(..., measured)`), so long text/URLs never overlap.
- `src/features/list` (map list), `src/features/editor` (canvas, TopicNode, keyboard shortcuts, `Popovers.tsx` = context menu / memo / link).
- Hash routing: `#/` list, `#/maps/:id` editor.
