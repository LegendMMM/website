import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const isSupabaseEnabled = Boolean(supabase);

export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string }> {
  if (!supabase) {
    return { ok: false, message: "尚未設定 Supabase 環境變數。" };
  }

  const { error } = await supabase.from("campaigns").select("id").limit(1);
  if (error) {
    return { ok: false, message: `連線失敗：${error.message}` };
  }
  return { ok: true, message: "Supabase 連線成功。" };
}
