import { db as defaultDb, type MindMapDB } from './db';
import { createMap, setTitle, syncRootWithTitle } from '../model/tree';
import { createNextDayMap } from '../model/nextDay';
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
      const source = await db.maps.get(id);
      if (!source) return undefined;
      const doc = createNextDayMap(source);
      await db.maps.add(doc);
      return doc;
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
      await db.maps.delete(id);
    },
  };
}

export type MapRepository = ReturnType<typeof createMapRepository>;

export const mapRepository = createMapRepository();
