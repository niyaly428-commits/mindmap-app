import type { MindMapDoc } from '../model/types';
import { supabase } from './supabase';
import type { CloudSyncRemote } from './types';

function client() {
  if (!supabase) throw new Error('クラウド同期の環境設定がありません。');
  return supabase;
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export const supabaseRemote: CloudSyncRemote = {
  async isInitialized() {
    const { data: { user }, error: authError } = await client().auth.getUser();
    throwIfError(authError);
    if (!user) throw new Error('ログインしてください。');
    const { data, error } = await client().from('user_sync_state').select('user_id').eq('user_id', user.id).maybeSingle();
    throwIfError(error);
    return Boolean(data);
  },
  async listMaps() {
    const { data, error } = await client().from('cloud_mindmaps').select('map_id,document,updated_at,deleted_at');
    throwIfError(error);
    return (data ?? []).map((row) => ({
      mapId: String(row.map_id),
      document: row.document as MindMapDoc | null,
      updatedAt: Number(row.updated_at),
      deletedAt: row.deleted_at === null ? null : Number(row.deleted_at),
    }));
  },
  async bootstrap(documents) {
    const { error } = await client().rpc('bootstrap_mindmaps', { p_documents: documents });
    throwIfError(error);
  },
  async saveMaps(rows) {
    if (!rows.length) return;
    const { error } = await client().rpc('merge_mindmaps', { p_records: rows });
    throwIfError(error);
  },
  async uploadAsset(userId, mapId, assetId, blob) {
    const { error } = await client().storage.from('mindmap-assets').upload(`${userId}/${mapId}/${assetId}`, blob, {
      upsert: true,
      contentType: blob.type || 'application/octet-stream',
      cacheControl: '3600',
    });
    throwIfError(error);
  },
  async downloadAsset(userId, mapId, assetId) {
    const { data, error } = await client().storage.from('mindmap-assets').download(`${userId}/${mapId}/${assetId}`);
    throwIfError(error);
    if (!data) throw new Error(`クラウド画像が見つかりません: ${assetId}`);
    return data;
  },
  async deleteAssets(userId, mapId, assetIds) {
    if (!assetIds.length) return;
    const { error } = await client().storage.from('mindmap-assets').remove(assetIds.map((id) => `${userId}/${mapId}/${id}`));
    throwIfError(error);
  },
};
