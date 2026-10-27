import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

/** The publishable key is intentionally supplied via environment configuration. */
export const cloudSyncConfigured = Boolean(url && key);
export const supabase: SupabaseClient | null = cloudSyncConfigured
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
