import type { CharacterName, ProductSeries } from "../types/domain";

export interface NormalProductImportRow {
  sku: string;
  name: string;
  series: ProductSeries;
  character: CharacterName | null;
  imageUrl: string | null;
  price: number;
  stock: number | null;
  maxPerUser: number | null;
}

export interface BlindProductImportRow {
  sku: string;
  name: string;
  series: ProductSeries;
  slotRestrictionEnabled: boolean;
  slotRestrictedCharacter: CharacterName | null;
  imageUrl: string | null;
  price: number;
  maxPerUser: number | null;
}

export interface BlindBoxItemImportRow {
  parentSku: string;
  sku: string;
  name: string;
  character: CharacterName;
  imageUrl: string | null;
  price: number | null;
  stock: number | null;
  maxPerUser: number | null;
}

const CHARACTER_SET = new Set<CharacterName>(["八千代", "彩葉", "輝耀姬", "帝", "乃依", "雷", "真實", "蘆花"]);
function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  const text = value.trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "y" || text === "是";
}

function parseNullableNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const text = value.trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      const next = line[i + 1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }

      current += ch;
    }

    cells.push(current.trim());
    return cells;
  };

  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

function toProductSeries(value: string | undefined): ProductSeries {
  if (value?.trim()) {
    return value.trim();
  }
  return "未分類";
}

function toCharacter(value: string | undefined): CharacterName | null {
  if (!value) return null;
  return CHARACTER_SET.has(value as CharacterName) ? (value as CharacterName) : null;
}

function assertNormalProductRow(row: NormalProductImportRow, index: number): string[] {
  const errors: string[] = [];
  if (!row.name) errors.push(`第 ${index} 筆：缺少 name`);
  if (!Number.isFinite(row.price) || row.price < 0) errors.push(`第 ${index} 筆：price 必填，且必須是 >= 0 的數字`);
  return errors;
}

function assertBlindProductRow(row: BlindProductImportRow, index: number): string[] {
  const errors: string[] = [];
  if (!row.name) errors.push(`第 ${index} 筆：缺少 name`);
  if (!Number.isFinite(row.price) || row.price < 0) errors.push(`第 ${index} 筆：price 必填，且必須是 >= 0 的數字`);
  return errors;
}

export function parseNormalProductImportCsv(text: string): { rows: NormalProductImportRow[]; errors: string[] } {
  const rawRows = parseCsv(text);
  const rows: NormalProductImportRow[] = [];
  const errors: string[] = [];

  rawRows.forEach((raw, idx) => {
    const price = parseNullableNumber(raw.price);
    const row: NormalProductImportRow = {
      sku: (raw.sku ?? "").trim(),
      name: (raw.name ?? "").trim(),
      series: toProductSeries(raw.series),
      character: toCharacter(raw.character),
      imageUrl: raw.imageUrl?.trim() ? raw.imageUrl.trim() : null,
      price: price ?? Number.NaN,
      stock: parseNullableNumber(raw.stock),
      maxPerUser: parseNullableNumber(raw.maxPerUser),
    };

    const rowErrors = assertNormalProductRow(row, idx + 1);
    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }
    rows.push(row);
  });

  return { rows, errors };
}

export function parseNormalProductImportJson(text: string): { rows: NormalProductImportRow[]; errors: string[] } {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return { rows: [], errors: ["JSON 必須是陣列。"] };
    }

    const rows: NormalProductImportRow[] = [];
    const errors: string[] = [];

    parsed.forEach((raw, idx) => {
      const item = raw as Record<string, unknown>;
      const price = item.price === null || item.price === undefined ? null : Number(item.price);
      const row: NormalProductImportRow = {
        sku: String(item.sku ?? "").trim(),
        name: String(item.name ?? "").trim(),
        series: toProductSeries(String(item.series ?? "")),
        character: toCharacter(typeof item.character === "string" ? item.character : undefined),
        imageUrl: typeof item.imageUrl === "string" && item.imageUrl.trim() ? item.imageUrl.trim() : null,
        price: price ?? Number.NaN,
        stock: item.stock === null || item.stock === undefined ? null : Number(item.stock),
        maxPerUser: item.maxPerUser === null || item.maxPerUser === undefined ? null : Number(item.maxPerUser),
      };

      const rowErrors = assertNormalProductRow(row, idx + 1);
      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        return;
      }
      rows.push(row);
    });

    return { rows, errors };
  } catch {
    return { rows: [], errors: ["JSON 格式錯誤。"] };
  }
}

export function parseBlindProductImportCsv(text: string): { rows: BlindProductImportRow[]; errors: string[] } {
  const rawRows = parseCsv(text);
  const rows: BlindProductImportRow[] = [];
  const errors: string[] = [];

  rawRows.forEach((raw, idx) => {
    const price = parseNullableNumber(raw.price);
    const row: BlindProductImportRow = {
      sku: (raw.sku ?? "").trim(),
      name: (raw.name ?? "").trim(),
      series: toProductSeries(raw.series),
      slotRestrictionEnabled: parseBoolean(raw.slotRestrictionEnabled, true),
      slotRestrictedCharacter: toCharacter(raw.slotRestrictedCharacter),
      imageUrl: raw.imageUrl?.trim() ? raw.imageUrl.trim() : null,
      price: price ?? Number.NaN,
      maxPerUser: parseNullableNumber(raw.maxPerUser),
    };

    const rowErrors = assertBlindProductRow(row, idx + 1);
    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }
    rows.push(row);
  });

  return { rows, errors };
}

export function parseBlindProductImportJson(text: string): { rows: BlindProductImportRow[]; errors: string[] } {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return { rows: [], errors: ["JSON 必須是陣列。"] };
    }

    const rows: BlindProductImportRow[] = [];
    const errors: string[] = [];

    parsed.forEach((raw, idx) => {
      const item = raw as Record<string, unknown>;
      const price = item.price === null || item.price === undefined ? null : Number(item.price);
      const row: BlindProductImportRow = {
        sku: String(item.sku ?? "").trim(),
        name: String(item.name ?? "").trim(),
        series: toProductSeries(String(item.series ?? "")),
        slotRestrictionEnabled: typeof item.slotRestrictionEnabled === "boolean" ? item.slotRestrictionEnabled : true,
        slotRestrictedCharacter: toCharacter(
          typeof item.slotRestrictedCharacter === "string" ? item.slotRestrictedCharacter : undefined,
        ),
        imageUrl: typeof item.imageUrl === "string" && item.imageUrl.trim() ? item.imageUrl.trim() : null,
        price: price ?? Number.NaN,
        maxPerUser: item.maxPerUser === null || item.maxPerUser === undefined ? null : Number(item.maxPerUser),
      };

      const rowErrors = assertBlindProductRow(row, idx + 1);
      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        return;
      }
      rows.push(row);
    });

    return { rows, errors };
  } catch {
    return { rows: [], errors: ["JSON 格式錯誤。"] };
  }
}

export function parseBlindItemImportCsv(text: string): { rows: BlindBoxItemImportRow[]; errors: string[] } {
  const rawRows = parseCsv(text);
  const rows: BlindBoxItemImportRow[] = [];
  const errors: string[] = [];

  rawRows.forEach((raw, idx) => {
    const character = toCharacter(raw.character);
    const stock = parseNullableNumber(raw.stock);
    const row: BlindBoxItemImportRow = {
      parentSku: (raw.parentSku ?? "").trim(),
      sku: (raw.sku ?? "").trim(),
      name: (raw.name ?? "").trim(),
      character: (character ?? "八千代") as CharacterName,
      imageUrl: raw.imageUrl?.trim() ? raw.imageUrl.trim() : null,
      price: parseNullableNumber(raw.price),
      stock,
      maxPerUser: parseNullableNumber(raw.maxPerUser),
    };

    if (!row.parentSku || !row.name || !character) {
      errors.push(`第 ${idx + 1} 筆：parentSku/name/character 必填`);
      return;
    }
    if (row.price !== null && row.price < 0) {
      errors.push(`第 ${idx + 1} 筆：price 必須是 >= 0 的數字`);
      return;
    }

    rows.push(row);
  });

  return { rows, errors };
}

export function parseBlindItemImportJson(text: string): { rows: BlindBoxItemImportRow[]; errors: string[] } {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return { rows: [], errors: ["JSON 必須是陣列。"] };
    }

    const rows: BlindBoxItemImportRow[] = [];
    const errors: string[] = [];

    parsed.forEach((raw, idx) => {
      const item = raw as Record<string, unknown>;
      const character = toCharacter(typeof item.character === "string" ? item.character : undefined);
      if (!character) {
        errors.push(`第 ${idx + 1} 筆：character 無效`);
        return;
      }

      const row: BlindBoxItemImportRow = {
        parentSku: String(item.parentSku ?? "").trim(),
        sku: String(item.sku ?? "").trim(),
        name: String(item.name ?? "").trim(),
        character,
        imageUrl: typeof item.imageUrl === "string" && item.imageUrl.trim() ? item.imageUrl.trim() : null,
        price: item.price === null || item.price === undefined ? null : Number(item.price),
        stock: item.stock === null || item.stock === undefined ? null : Number(item.stock),
        maxPerUser: item.maxPerUser === null || item.maxPerUser === undefined ? null : Number(item.maxPerUser),
      };

      if (!row.parentSku || !row.name) {
        errors.push(`第 ${idx + 1} 筆：parentSku/name 必填`);
        return;
      }
      if (row.price !== null && row.price < 0) {
        errors.push(`第 ${idx + 1} 筆：price 必須是 >= 0 的數字`);
        return;
      }

      rows.push(row);
    });

    return { rows, errors };
  } catch {
    return { rows: [], errors: ["JSON 格式錯誤。"] };
  }
}

export const NORMAL_PRODUCT_IMPORT_CSV_TEMPLATE = `sku,name,series,character,imageUrl,price,stock,maxPerUser
,八千代吊飾,Q版系列,八千代,https://example.com/yachiyo-charm.jpg,120,8,2`;

export const NORMAL_PRODUCT_IMPORT_JSON_TEMPLATE = `[
  {
    "sku": "",
    "name": "八千代吊飾",
    "series": "Q版系列",
    "character": "八千代",
    "imageUrl": "https://example.com/yachiyo-charm.jpg",
    "price": 120,
    "stock": 8,
    "maxPerUser": 2
  }
]`;

export const BLIND_PRODUCT_IMPORT_CSV_TEMPLATE = `sku,name,series,slotRestrictionEnabled,slotRestrictedCharacter,imageUrl,price,maxPerUser
,Q版壓克力,HOBBY系列,true,,https://example.com/q-acrylic.jpg,150,1`;

export const BLIND_PRODUCT_IMPORT_JSON_TEMPLATE = `[
  {
    "sku": "",
    "name": "Q版壓克力",
    "series": "HOBBY系列",
    "slotRestrictionEnabled": true,
    "slotRestrictedCharacter": null,
    "imageUrl": "https://example.com/q-acrylic.jpg",
    "price": 150,
    "maxPerUser": 1
  }
]`;

export const BLIND_ITEM_IMPORT_CSV_TEMPLATE = `parentSku,sku,name,character,imageUrl,price,stock,maxPerUser\nPRD-0001,,盲盒-八千代,八千代,https://example.com/y.jpg,,3,1`;

export const BLIND_ITEM_IMPORT_JSON_TEMPLATE = `[
  {
    "parentSku": "PRD-0001",
    "sku": "",
    "name": "盲盒-八千代",
    "character": "八千代",
    "imageUrl": "https://example.com/y.jpg",
    "price": null,
    "stock": 3,
    "maxPerUser": 1
  }
]`;
