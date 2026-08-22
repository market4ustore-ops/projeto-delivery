import { createClient } from '@supabase/supabase-js';

export const createBrowserDatabaseClient = (url: string, anonKey: string) =>
  createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
