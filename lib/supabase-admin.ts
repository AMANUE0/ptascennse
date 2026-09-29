import { createClient } from "@supabase/supabase-js";
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY en .env.local");
  if (!key.startsWith("sb_secret_") && !key.includes(".") ) throw new Error("SUPABASE_SECRET_KEY no tiene un formato válido");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
