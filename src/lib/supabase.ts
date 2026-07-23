import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabaseConfigured = Boolean(url && key);
export const supabase = createClient(url || "https://exemple.supabase.co", key || "cle-publique-manquante", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
