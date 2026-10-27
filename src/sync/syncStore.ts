import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { cloudSyncConfigured, supabase } from './supabase';
import { supabaseRemote } from './supabaseRemote';
import { downloadCloudAsMaster, syncBidirectional, uploadLocalAsMaster } from './syncEngine';

export type SyncStatus = 'unconfigured' | 'signed-out' | 'needs-initial-choice' | 'syncing' | 'synced' | 'offline' | 'error';

interface CloudSyncState {
  session: Session | null;
  status: SyncStatus;
  initialized: boolean | null;
  message: string;
  start: () => () => void;
  signIn: (email: string, password: string, createAccount: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  uploadMaster: () => Promise<void>;
  downloadMaster: () => Promise<void>;
  syncNow: () => Promise<void>;
}

let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;

async function refreshAndSync(set: (partial: Partial<CloudSyncState>) => void, get: () => CloudSyncState) {
  const session = get().session;
  if (!session) return;
  if (!navigator.onLine) { set({ status: 'offline', message: 'オフラインです。ローカルデータは引き続き利用できます。' }); return; }
  if (running) return;
  running = true;
  set({ status: 'syncing', message: 'Syncing...' });
  try {
    const initialized = await supabaseRemote.isInitialized();
    set({ initialized });
    if (!initialized) {
      set({ status: 'needs-initial-choice', message: '初回同期の方向を選択してください。ローカルデータは自動送信されません。' });
      return;
    }
    const retainedVersions = await syncBidirectional(session.user.id, supabaseRemote);
    set({
      status: 'synced',
      message: retainedVersions ? `Synced. ${retainedVersions} conflicting version(s) were kept in local recovery backups.` : 'Synced',
    });
  } catch (error) {
    set({ status: 'error', message: error instanceof Error ? error.message : '同期に失敗しました。ローカルデータは保持されています。' });
  } finally {
    running = false;
  }
}

export const useCloudSyncStore = create<CloudSyncState>((set, get) => ({
  session: null,
  status: cloudSyncConfigured ? 'signed-out' : 'unconfigured',
  initialized: null,
  message: cloudSyncConfigured ? 'Not signed in' : 'Cloud sync setup required',
  start: () => {
    if (!supabase) return () => undefined;
    let active = true;
    const receiveSession = (session: Session | null) => {
      set({ session, initialized: null, status: session ? 'syncing' : 'signed-out', message: session ? 'Checking cloud…' : 'Not signed in' });
      if (session) void refreshAndSync((partial) => active && set(partial), get);
    };
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) set({ status: 'error', message: error.message });
      if (active) receiveSession(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer network work out of Supabase's auth callback to avoid holding its lock.
      queueMicrotask(() => { if (active) receiveSession(session); });
    });
    const scheduleSync = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refreshAndSync(set, get), 250);
    };
    window.addEventListener('mindmap:local-change', scheduleSync);
    window.addEventListener('online', scheduleSync);
    const onOffline = () => { if (get().session) set({ status: 'offline', message: 'Offline. Local editing is still available.' }); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', scheduleSync);
    const onVisible = () => { if (document.visibilityState === 'visible') scheduleSync(); };
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(scheduleSync, 60_000);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener('mindmap:local-change', scheduleSync);
      window.removeEventListener('online', scheduleSync);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', scheduleSync);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
      clearTimeout(timer);
    };
  },
  signIn: async (email, password, createAccount) => {
    if (!supabase) throw new Error('クラウド同期の環境設定がありません。');
    const { error } = createAccount
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    if (createAccount) set({ message: 'アカウントを作成しました。メール確認が有効な場合は受信箱を確認してください。' });
  },
  signOut: async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    set({ session: null, initialized: null, status: 'signed-out', message: 'Not signed in' });
  },
  uploadMaster: async () => {
    const session = get().session;
    if (!session) throw new Error('ログインしてください。');
    set({ status: 'syncing', message: 'Uploading this PC as the original…' });
    try {
      await uploadLocalAsMaster(session.user.id, supabaseRemote);
      set({ initialized: true, status: 'synced', message: 'This PC initialized the cloud. Synced.' });
    } catch (error) {
      set({ status: 'needs-initial-choice', message: error instanceof Error ? error.message : '初回アップロードに失敗しました。' });
      throw error;
    }
  },
  downloadMaster: async () => {
    const session = get().session;
    if (!session) throw new Error('ログインしてください。');
    set({ status: 'syncing', message: 'Downloading the cloud copy…' });
    try {
      await downloadCloudAsMaster(session.user.id, supabaseRemote);
      set({ initialized: true, status: 'synced', message: 'Cloud data downloaded. This PC backup was retained.' });
    } catch (error) {
      set({ status: 'needs-initial-choice', message: error instanceof Error ? error.message : 'クラウドからの読み込みに失敗しました。ローカルデータは保持されています。' });
      throw error;
    }
  },
  syncNow: async () => refreshAndSync(set, get),
}));
