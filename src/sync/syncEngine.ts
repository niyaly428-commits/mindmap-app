import { db as defaultDb, type MapAsset, type MindMapDB, type SyncBackup } from '../db/db';
import type { MindMapDoc } from '../model/types';
import type { CloudMapRecord, CloudSyncRemote } from './types';

const idOf = () => crypto.randomUUID();
const docRecord = (doc: MindMapDoc): CloudMapRecord => ({ mapId: doc.id, document: doc, updatedAt: doc.updatedAt, deletedAt: null });
const tombstoneRecord = (mapId: string, deletedAt: number): CloudMapRecord => ({ mapId, document: null, updatedAt: deletedAt, deletedAt });
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function referencedAssetIds(docs: MindMapDoc[]) {
  return new Set(docs.flatMap((doc) => Object.values(doc.nodes).flatMap((node) => node.images ?? [])));
}

async function uploadReferencedAssets(db: MindMapDB, remote: CloudSyncRemote, userId: string, docs: MindMapDoc[]) {
  const ids = referencedAssetIds(docs);
  const assets = (await db.assets.toArray()).filter((asset) => ids.has(asset.id));
  if (assets.length !== ids.size) throw new Error('ローカル画像データが見つかりません。画像を含む同期は停止しました。');
  for (const asset of assets) await remote.uploadAsset(userId, asset.mapId, asset.id, asset.blob);
}

async function downloadAssets(remote: CloudSyncRemote, userId: string, docs: MindMapDoc[]): Promise<MapAsset[]> {
  const needed = new Map<string, string>();
  for (const doc of docs) for (const assetId of referencedAssetIds([doc])) needed.set(assetId, doc.id);
  const assets: MapAsset[] = [];
  for (const [id, mapId] of needed) {
    const blob = await remote.downloadAsset(userId, mapId, id);
    assets.push({ id, mapId, blob, type: blob.type || 'application/octet-stream', createdAt: Date.now() });
  }
  return assets;
}

async function rememberBackup(
  db: MindMapDB,
  docs: MindMapDoc[],
  assets: MapAsset[],
  reason: SyncBackup['reason'],
): Promise<void> {
  if (!docs.length) return;
  await db.syncBackups.add({ id: idOf(), createdAt: Date.now(), mapId: docs.length === 1 ? docs[0].id : null, reason, docs, assets });
}

export async function uploadLocalAsMaster(
  userId: string,
  remote: CloudSyncRemote,
  local: MindMapDB = defaultDb,
): Promise<void> {
  if (await remote.isInitialized()) throw new Error('クラウドはすでに初期化されています。上書きアップロードはできません。');
  const documents = await local.maps.toArray();
  if (!documents.length) throw new Error('このPCにマインドマップがないため、初回アップロードを中止しました。');
  await uploadReferencedAssets(local, remote, userId, documents);
  // The server RPC atomically claims the empty account and inserts every map.
  await remote.bootstrap(documents);
  await local.transaction('rw', local.syncMeta, local.syncTombstones, async () => {
    await local.syncMeta.clear();
    await local.syncMeta.bulkPut(documents.map((doc) => ({ mapId: doc.id, syncedAt: doc.updatedAt })));
    await local.syncTombstones.clear();
  });
}

export async function downloadCloudAsMaster(
  userId: string,
  remote: CloudSyncRemote,
  local: MindMapDB = defaultDb,
): Promise<void> {
  if (!(await remote.isInitialized())) throw new Error('クラウドに仕事PCの初回データがまだありません。ローカルデータは変更していません。');
  const rows = await remote.listMaps();
  const documents = rows.flatMap((row) => row.document ? [row.document] : []);
  if (!documents.length) throw new Error('クラウドに読み込めるマインドマップがありません。ローカルデータは変更していません。');
  // Finish all network reads before touching the existing IndexedDB data.
  const downloadedAssets = await downloadAssets(remote, userId, documents);
  const oldDocs = await local.maps.toArray();
  const oldAssets = await local.assets.toArray();
  await local.transaction('rw', local.maps, local.assets, local.syncBackups, local.syncMeta, local.syncTombstones, async () => {
    await rememberBackup(local, oldDocs, oldAssets, 'initial-download');
    await local.maps.clear();
    await local.assets.clear();
    await local.maps.bulkPut(documents);
    if (downloadedAssets.length) await local.assets.bulkPut(downloadedAssets);
    await local.syncTombstones.clear();
    await local.syncMeta.clear();
    await local.syncMeta.bulkPut(rows.map((row) => ({ mapId: row.mapId, syncedAt: row.updatedAt })));
  });
}

export async function syncBidirectional(
  userId: string,
  remote: CloudSyncRemote,
  local: MindMapDB = defaultDb,
): Promise<number> {
  if (!(await remote.isInitialized())) throw new Error('初回同期の方向を選択してください。');
  const [localDocs, tombstones, remoteRows, localAssets, syncMeta] = await Promise.all([
    local.maps.toArray(), local.syncTombstones.toArray(), remote.listMaps(), local.assets.toArray(), local.syncMeta.toArray(),
  ]);
  const docsById = new Map(localDocs.map((doc) => [doc.id, doc]));
  const tombById = new Map(tombstones.map((row) => [row.mapId, row.deletedAt]));
  const remoteById = new Map(remoteRows.map((row) => [row.mapId, row]));
  const metaById = new Map(syncMeta.map((row) => [row.mapId, row.syncedAt]));
  const ids = new Set([...docsById.keys(), ...tombById.keys(), ...remoteById.keys()]);
  const toUpload: CloudMapRecord[] = [];
  const toApply: CloudMapRecord[] = [];
  const backupRemote: CloudMapRecord[] = [];
  const backupLocal: MindMapDoc[] = [];
  const deleteCloudAssets: { mapId: string; assetIds: string[] }[] = [];

  for (const mapId of ids) {
    const doc = docsById.get(mapId);
    const localDeleteAt = tombById.get(mapId);
    const localRow = doc ? docRecord(doc) : localDeleteAt ? tombstoneRecord(mapId, localDeleteAt) : undefined;
    const remoteRow = remoteById.get(mapId);
    if (!localRow && remoteRow) { toApply.push(remoteRow); continue; }
    if (localRow && !remoteRow) { toUpload.push(localRow); continue; }
    if (!localRow || !remoteRow) continue;

    const localWins = localRow.updatedAt >= remoteRow.updatedAt;
    if (localRow.updatedAt === remoteRow.updatedAt && !sameJson(localRow, remoteRow)) {
      backupRemote.push(remoteRow);
    } else if (localWins && remoteRow.updatedAt > (metaById.get(mapId) ?? -1)) {
      // The cloud changed after this device's last successful sync; retain that version.
      backupRemote.push(remoteRow);
    }
    if (localWins) {
      if (doc && remoteRow.document && !sameJson(doc, remoteRow.document) && remoteRow.updatedAt > (metaById.get(mapId) ?? -1)) {
        backupRemote.push(remoteRow);
      }
      toUpload.push(localRow);
      if (!doc && remoteRow.document) deleteCloudAssets.push({ mapId, assetIds: Array.from(referencedAssetIds([remoteRow.document])) });
    } else {
      if (doc) backupLocal.push(doc);
      toApply.push(remoteRow);
    }
  }

  const uniqueRemoteBackups = Array.from(new Map(backupRemote.map((row) => [row.mapId, row])).values());
  const remoteBackupDocs = uniqueRemoteBackups.flatMap((row) => row.document ? [row.document] : []);
  const remoteBackupAssets = remoteBackupDocs.length ? await downloadAssets(remote, userId, remoteBackupDocs) : [];
  const inboundDocs = toApply.flatMap((row) => row.document ? [row.document] : []);
  const inboundAssets = inboundDocs.length ? await downloadAssets(remote, userId, inboundDocs) : [];
  const localBackupAssets = localAssets.filter((asset) => backupLocal.some((doc) => doc.id === asset.mapId));
  const uploadDocs = toUpload.flatMap((row) => row.document ? [row.document] : []);
  await uploadReferencedAssets(local, remote, userId, uploadDocs);
  if (toUpload.length) await remote.saveMaps(toUpload);
  for (const removal of deleteCloudAssets) await remote.deleteAssets(userId, removal.mapId, removal.assetIds);

  await local.transaction('rw', local.maps, local.assets, local.syncBackups, local.syncMeta, local.syncTombstones, async () => {
    await rememberBackup(local, backupLocal, localBackupAssets, 'remote-update');
    await rememberBackup(local, remoteBackupDocs, remoteBackupAssets, 'sync-conflict');
    for (const row of toApply) {
      const before = docsById.get(row.mapId);
      if (row.document) {
        await local.maps.put(row.document);
        await local.assets.where('mapId').equals(row.mapId).delete();
        const assets = inboundAssets.filter((asset) => asset.mapId === row.mapId);
        if (assets.length) await local.assets.bulkPut(assets);
        await local.syncTombstones.delete(row.mapId);
      } else {
        await local.maps.delete(row.mapId);
        await local.assets.where('mapId').equals(row.mapId).delete();
        await local.syncTombstones.put({ mapId: row.mapId, deletedAt: row.updatedAt });
      }
      if (before && row.document && before.id !== row.document.id) throw new Error('同期先マップIDの不整合');
    }
    const metaRows = [...toApply, ...toUpload].map((row) => ({ mapId: row.mapId, syncedAt: row.updatedAt }));
    if (metaRows.length) await local.syncMeta.bulkPut(metaRows);
    for (const row of toUpload) if (row.deletedAt) await local.syncTombstones.delete(row.mapId);
  });
  return backupLocal.length + remoteBackupDocs.length;
}
