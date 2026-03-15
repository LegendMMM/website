import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const ADMIN_IMAGE_BUCKET = "handan-images";

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

function makeStorageSafeSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "image";
}

function inferImageExtension(file: File): string {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  const parts = file.name.split(".");
  return parts.length > 1 ? makeStorageSafeSegment(parts.pop() ?? "png") : "png";
}

export async function uploadImageToSupabaseStorage(
  file: File,
  folder: "products" | "blind-items",
): Promise<{ ok: boolean; url: string | null; message: string }> {
  if (!supabase) {
    return { ok: false, url: null, message: "尚未設定 Supabase 環境變數。" };
  }

  const extension = inferImageExtension(file);
  const baseName = makeStorageSafeSegment(file.name.replace(/\.[^.]+$/, ""));
  const path = `${folder}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${baseName}.${extension}`;

  const { error } = await supabase.storage.from(ADMIN_IMAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });

  if (error) {
    return { ok: false, url: null, message: error.message };
  }

  const { data } = supabase.storage.from(ADMIN_IMAGE_BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl, message: "圖片已上傳到 Supabase Storage。" };
}
