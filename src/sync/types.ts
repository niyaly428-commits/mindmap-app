import type { MindMapDoc } from '../model/types';

export interface CloudMapRecord {
  mapId: string;
  document: MindMapDoc | null;
  updatedAt: number;
  deletedAt: number | null;
}

export interface CloudSyncRemote {
  isInitialized(): Promise<boolean>;
  listMaps(): Promise<CloudMapRecord[]>;
  bootstrap(documents: MindMapDoc[]): Promise<void>;
  saveMaps(rows: CloudMapRecord[]): Promise<void>;
  uploadAsset(userId: string, mapId: string, assetId: string, blob: Blob): Promise<void>;
  downloadAsset(userId: string, mapId: string, assetId: string): Promise<Blob>;
  deleteAssets(userId: string, mapId: string, assetIds: string[]): Promise<void>;
}
