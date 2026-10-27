import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('./supabase', () => ({ cloudSyncConfigured: true, supabase: { auth } }));

import { useCloudSyncStore } from './syncStore';

describe('cloud account actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.signInWithPassword.mockResolvedValue({ error: null });
    auth.signUp.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValue({ error: null });
    useCloudSyncStore.setState({ session: null, status: 'signed-out', initialized: null, message: '' });
  });

  it('logs in without changing local storage and signs out without deleting local data', async () => {
    await useCloudSyncStore.getState().signIn('owner@example.com', 'a-safe-password', false);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'owner@example.com', password: 'a-safe-password' });
    await useCloudSyncStore.getState().signOut();
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(useCloudSyncStore.getState()).toMatchObject({ session: null, status: 'signed-out' });
  });

  it('creates the shared account through Supabase Auth', async () => {
    await useCloudSyncStore.getState().signIn('owner@example.com', 'a-safe-password', true);
    expect(auth.signUp).toHaveBeenCalledWith({ email: 'owner@example.com', password: 'a-safe-password' });
  });

  it('surfaces authentication errors rather than presenting a successful login', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'invalid credentials' } });
    await expect(useCloudSyncStore.getState().signIn('owner@example.com', 'wrong', false)).rejects.toThrow('invalid credentials');
  });
});
