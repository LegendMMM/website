import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_CONFIG } from "./config.js";

let supabase = null;

export function getSupabase() {
  if (supabase) return supabase;

  if (!APP_CONFIG.supabaseUrl || !APP_CONFIG.supabaseAnonKey) {
    throw new Error("Supabase 設定尚未完成，請先修改 assets/config.js");
  }

  supabase = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey);
  return supabase;
}
