import Dexie, { type EntityTable } from 'dexie';
import type { MindMapDoc } from '../model/types';

export interface MapAsset { id: string; mapId: string; blob: Blob; type: string; createdAt: number }
export interface SyncBackup {
  id: string;
  createdAt: number;
  mapId: string | null;
  reason: 'initial-download' | 'remote-update' | 'sync-conflict';
  docs: MindMapDoc[];
  assets: MapAsset[];
}
export interface SyncTombstone { mapId: string; deletedAt: number }
export interface SyncMeta { mapId: string; syncedAt: number }

/**
 * Local database (IndexedDB via Dexie).
 *
 * - `maps`: one record per mind map (whole JSON document).
 * - `assets`: image Blobs referenced from node `images` IDs.
 * - `syncBackups`, `syncTombstones`, and `syncMeta`: local recovery and sync bookkeeping.
 */
export class MindMapDB extends Dexie {
  maps!: EntityTable<MindMapDoc, 'id'>;
  assets!: EntityTable<MapAsset, 'id'>;
  syncBackups!: EntityTable<SyncBackup, 'id'>;
  syncTombstones!: EntityTable<SyncTombstone, 'mapId'>;
  syncMeta!: EntityTable<SyncMeta, 'mapId'>;

  constructor(name = 'mindmap-app') {
    super(name);
    this.version(1).stores({ maps: 'id, updatedAt' });
    this.version(2).stores({ maps: 'id, updatedAt', assets: 'id, mapId' });
    this.version(3).stores({ maps: 'id, updatedAt', assets: 'id, mapId', syncBackups: 'id, createdAt, mapId', syncTombstones: 'mapId, deletedAt', syncMeta: 'mapId' });
  }
}

export const db = new MindMapDB();

/** Ask the browser not to evict our data under storage pressure (best effort). */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}
