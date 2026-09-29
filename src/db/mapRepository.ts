import { db as defaultDb, type MindMapDB } from './db';
import { createMap, setTitle, syncRootWithTitle } from '../model/tree';
import { createNextDayMap } from '../model/nextDay';
import { createId } from '../model/tree';
import type { MindMapDoc, MindMapSummary } from '../model/types';

export function createMapRepository(db: MindMapDB = defaultDb) {
  return {
    async list(): Promise<MindMapSummary[]> {
      const maps = await db.maps.orderBy('updatedAt').reverse().toArray();
      return maps.map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }));
    },
    async get(id: string): Promise<MindMapDoc | undefined> {
      const doc = await db.maps.get(id);
      return doc && syncRootWithTitle(doc);
    },
    async create(title?: string): Promise<MindMapDoc> {
      const doc = createMap(title);
      await db.maps.add(doc);
      return doc;
    },
    /** Creates the next day's map from `id` (the source map is left untouched). */
    async createNextDay(id: string): Promise<MindMapDoc | undefined> {
      return db.transaction('rw', db.maps, db.assets, async () => {
        const source = await db.maps.get(id);
        if (!source) return undefined;
        const doc = createNextDayMap(source);
        for (const node of Object.values(doc.nodes)) {
          if (!node.images?.length) continue;
          const copied: string[] = [];
          for (const assetId of node.images) {
            const asset = await db.assets.get(assetId);
            if (!asset) continue;
            const nextId = createId();
            await db.assets.add({ ...asset, id: nextId, mapId: doc.id });
            copied.push(nextId);
          }
          node.images = copied;
        }
        await db.maps.add(doc);
        return doc;
      });
    },
    async save(doc: MindMapDoc): Promise<void> {
      await db.maps.put(doc);
    },
    async rename(id: string, title: string): Promise<void> {
      await db.transaction('rw', db.maps, async () => {
        const doc = await db.maps.get(id);
        if (doc) await db.maps.put({ ...setTitle(doc, title), updatedAt: Date.now() });
      });
    },
    async remove(id: string): Promise<void> {
      await db.transaction('rw', db.maps, db.assets, async () => {
        await db.assets.where('mapId').equals(id).delete();
        await db.maps.delete(id);
      });
    },
    async addImage(mapId: string, blob: Blob): Promise<string> {
      const id = createId();
      await db.assets.add({ id, mapId, blob, type: blob.type, createdAt: Date.now() });
      return id;
    },
    async getImage(id: string): Promise<Blob | undefined> { return (await db.assets.get(id))?.blob; },
    async removeImage(id: string): Promise<void> { await db.assets.delete(id); },
  };
}

export type MapRepository = ReturnType<typeof createMapRepository>;

export const mapRepository = createMapRepository();
