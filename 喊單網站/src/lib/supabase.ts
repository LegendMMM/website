import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const ADMIN_IMAGE_BUCKET = "handan-images";
const COMPRESSIBLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp"]);
const COMPRESSED_IMAGE_MAX_EDGE = 1600;
const COMPRESSED_IMAGE_QUALITY = 0.82;

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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("讀取圖片失敗。"));
    };
    reader.onerror = () => reject(new Error("讀取圖片失敗。"));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("圖片解碼失敗。"));
    image.src = src;
  });
}

export async function prepareImageForUpload(
  file: File,
): Promise<{ ok: boolean; file: File; message: string }> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, file, message: "只能上傳圖片檔。" };
  }

  if (!COMPRESSIBLE_IMAGE_TYPES.has(file.type)) {
    return { ok: true, file, message: "此圖片格式維持原檔上傳。" };
  }

  try {
    const sourceUrl = await readFileAsDataUrl(file);
    const image = await loadImageElement(sourceUrl);
    const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longestEdge > COMPRESSED_IMAGE_MAX_EDGE ? COMPRESSED_IMAGE_MAX_EDGE / longestEdge : 1;
    const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return { ok: true, file, message: "瀏覽器不支援圖片壓縮，已使用原檔。" };
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", COMPRESSED_IMAGE_QUALITY);
    });

    if (!blob) {
      return { ok: true, file, message: "圖片壓縮失敗，已使用原檔。" };
    }

    const nextFile = new File(
      [blob],
      `${file.name.replace(/\.[^.]+$/, "") || "image"}.webp`,
      { type: "image/webp" },
    );

    if (nextFile.size >= file.size && scale === 1) {
      return { ok: true, file, message: "圖片已檢查，原檔已足夠精簡。" };
    }

    return {
      ok: true,
      file: nextFile,
      message: `圖片已先壓縮為 WebP（${Math.round(file.size / 1024)}KB → ${Math.round(nextFile.size / 1024)}KB）。`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "圖片壓縮失敗";
    return { ok: true, file, message: `${detail}，已使用原檔。` };
  }
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
