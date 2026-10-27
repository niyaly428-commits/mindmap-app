import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { MindMapDB } from '../db/db';
import { createMap, setTitle } from '../model/tree';
import type { MindMapDoc } from '../model/types';
import { downloadCloudAsMaster, syncBidirectional, uploadLocalAsMaster } from './syncEngine';
import type { CloudMapRecord, CloudSyncRemote } from './types';

let databases: MindMapDB[] = [];
function newDb() {
  const local = new MindMapDB(`sync-${crypto.randomUUID()}`);
  databases.push(local);
  return local;
}
afterEach(async () => { await Promise.all(databases.map((database) => database.delete())); databases = []; });

class MemoryRemote implements CloudSyncRemote {
  initialized = false;
  maps = new Map<string, CloudMapRecord>();
  assets = new Map<string, Blob>();
  async isInitialized() { return this.initialized; }
  async listMaps() { return [...this.maps.values()]; }
  async bootstrap(documents: MindMapDoc[]) {
    if (this.initialized) throw new Error('already initialized');
    if (!documents.length) throw new Error('no maps');
    this.initialized = true;
    for (const document of documents) this.maps.set(document.id, { mapId: document.id, document, updatedAt: document.updatedAt, deletedAt: null });
  }
  async saveMaps(rows: CloudMapRecord[]) {
    for (const row of rows) if (!this.maps.has(row.mapId) || this.maps.get(row.mapId)!.updatedAt <= row.updatedAt) this.maps.set(row.mapId, row);
  }
  async uploadAsset(userId: string, mapId: string, assetId: string, blob: Blob) { this.assets.set(`${userId}/${mapId}/${assetId}`, blob); }
  async downloadAsset(userId: string, mapId: string, assetId: string) {
    const value = this.assets.get(`${userId}/${mapId}/${assetId}`);
    if (!value) throw new Error(`missing asset ${assetId}`);
    return value;
  }
  async deleteAssets(userId: string, mapId: string, assetIds: string[]) { for (const id of assetIds) this.assets.delete(`${userId}/${mapId}/${id}`); }
}

describe('first and ongoing cloud sync', () => {
  it('upgrades a version-2 IndexedDB in place without dropping existing maps or Blobs', async () => {
    const name = `legacy-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores({ maps: 'id, updatedAt' });
    legacy.version(2).stores({ maps: 'id, updatedAt', assets: 'id, mapId' });
    await legacy.open();
    const existing = createMap('Before upgrade');
    await legacy.table('maps').put(existing);
    await legacy.table('assets').put({ id: 'old-image', mapId: existing.id, blob: new Blob(['kept']), type: 'image/png', createdAt: 1 });
    legacy.close();
    const upgraded = new MindMapDB(name);
    databases.push(upgraded);
    expect((await upgraded.maps.get(existing.id))?.title).toBe('Before upgrade');
    expect(await (await upgraded.assets.get('old-image'))?.blob.text()).toBe('kept');
    expect(await upgraded.syncBackups.count()).toBe(0);
  });

  it('refuses a home-PC download before bootstrap and never touches its existing local data', async () => {
    const local = newDb();
    const homeDoc = createMap('Home only');
    await local.maps.add(homeDoc);
    const remote = new MemoryRemote();
    await expect(downloadCloudAsMaster('home', remote, local)).rejects.toThrow(/仕事PCの初回データ/);
    expect(await local.maps.toArray()).toEqual([homeDoc]);
    expect(remote.maps.size).toBe(0);
  });

  it('uses the original PC as the one-time authority, backs up the receiver before import, and syncs both ways with images', async () => {
    const work = newDb();
    const home = newDb();
    const remote = new MemoryRemote();
    const source = createMap('Work master');
    const taskId = Object.keys(source.nodes)[0];
    const sourceMap = { ...source, nodes: { ...source.nodes, [taskId]: { ...source.nodes[taskId], images: ['photo-1'] } } };
    const photo = new Blob(['work image'], { type: 'image/png' });
    await work.maps.add(sourceMap);
    await work.assets.add({ id: 'photo-1', mapId: source.id, blob: photo, type: photo.type, createdAt: 1 });

    await uploadLocalAsMaster('work-user', remote, work);
    expect(remote.maps.get(source.id)?.document?.title).toBe('Work master');
    expect(await (await remote.downloadAsset('work-user', source.id, 'photo-1')).text()).toBe('work image');
    await expect(uploadLocalAsMaster('home-user', remote, home)).rejects.toThrow(/すでに初期化/);

    const homeOnly = createMap('Home backup');
    await home.maps.add(homeOnly);
    await downloadCloudAsMaster('work-user', remote, home);
    expect((await home.maps.toArray()).map((doc) => doc.title)).toEqual(['Work master']);
    expect(await home.assets.get('photo-1')).toMatchObject({ mapId: source.id });
    expect((await home.syncBackups.toArray())[0].docs.map((doc) => doc.title)).toEqual(['Home backup']);

    const homeEdit = setTitle((await home.maps.get(source.id))!, 'Edited at home');
    await home.maps.put({ ...homeEdit, updatedAt: Date.now() + 200 });
    await syncBidirectional('work-user', remote, home);
    const workAfterHomeSync = newDb();
    await syncBidirectional('work-user', remote, workAfterHomeSync);
    expect((await workAfterHomeSync.maps.get(source.id))?.title).toBe('Edited at home');

    const workEdit = setTitle((await workAfterHomeSync.maps.get(source.id))!, 'Edited at work');
    await workAfterHomeSync.maps.put({ ...workEdit, updatedAt: Date.now() + 400 });
    await syncBidirectional('work-user', remote, workAfterHomeSync);
    await syncBidirectional('work-user', remote, home);
    expect((await home.maps.get(source.id))?.title).toBe('Edited at work');
  });

  it('does not replace local data if an image transfer fails before the IndexedDB transaction', async () => {
    const local = newDb();
    const old = createMap('Keep this');
    await local.maps.add(old);
    const remote = new MemoryRemote();
    remote.initialized = true;
    const incoming = createMap('Incoming');
    const withImage = { ...incoming, nodes: { ...incoming.nodes, [incoming.rootId]: { ...incoming.nodes[incoming.rootId], images: ['missing'] } } };
    remote.maps.set(incoming.id, { mapId: incoming.id, document: withImage, updatedAt: incoming.updatedAt, deletedAt: null });
    await expect(downloadCloudAsMaster('user', remote, local)).rejects.toThrow(/missing asset/);
    expect(await local.maps.toArray()).toEqual([old]);
    expect(await local.syncBackups.count()).toBe(0);
  });

  it('retains a cloud edit made since the local base when the local timestamp wins', async () => {
    const local = newDb();
    const remote = new MemoryRemote();
    const base = createMap('Base');
    await local.maps.add(base);
    await uploadLocalAsMaster('user', remote, local);
    const cloudEdit = { ...setTitle(base, 'Edited on the other PC'), updatedAt: base.updatedAt + 100 };
    await remote.saveMaps([{ mapId: base.id, document: cloudEdit, updatedAt: cloudEdit.updatedAt, deletedAt: null }]);
    const localEdit = { ...setTitle(base, 'Edited on this PC'), updatedAt: base.updatedAt + 200 };
    await local.maps.put(localEdit);

    const retained = await syncBidirectional('user', remote, local);
    expect(retained).toBe(1);
    expect((await local.syncBackups.toArray()).flatMap((backup) => backup.docs).map((doc) => doc.title)).toContain('Edited on the other PC');
    expect(remote.maps.get(base.id)?.document?.title).toBe('Edited on this PC');
  });
});
