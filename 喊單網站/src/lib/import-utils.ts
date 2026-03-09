import { PRODUCT_SERIES_OPTIONS } from "./constants";
import type { CharacterName, ProductRequiredTier, ProductSeries, ProductType } from "../types/domain";

export interface ProductImportRow {
  sku: string;
  name: string;
  series: ProductSeries;
  type: ProductType;
  character: CharacterName | null;
  slotRestrictionEnabled: boolean;
  slotRestrictedCharacter: CharacterName | null;
  requiredTier: ProductRequiredTier;
  imageUrl: string | null;
  isPopular: boolean;
  hotPrice: number;
  coldPrice: number;
  averagePrice: number;
  stock: number | null;
  maxPerUser: number | null;
}

export interface BlindBoxItemImportRow {
  parentSku: string;
  sku: string;
  name: string;
  character: CharacterName;
  imageUrl: string | null;
  stock: number;
  maxPerUser: number | null;
}

const CHARACTER_SET = new Set<CharacterName>(["八千代", "彩葉", "輝耀姬", "帝", "乃依", "雷", "真實", "蘆花"]);
const REQUIRED_TIER_SET = new Set<ProductRequiredTier>(["FIXED_1", "FIXED_2", "FIXED_3", "LEAK_PICK"]);

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
  if (value && PRODUCT_SERIES_OPTIONS.includes(value as ProductSeries)) {
    return value as ProductSeries;
  }
  return "其他系列";
}

function toProductType(value: string | undefined): ProductType {
  return value === "BLIND_BOX" ? "BLIND_BOX" : "NORMAL";
}

function toCharacter(value: string | undefined): CharacterName | null {
  if (!value) return null;
  return CHARACTER_SET.has(value as CharacterName) ? (value as CharacterName) : null;
}

function toRequiredTier(value: string | undefined): ProductRequiredTier {
  if (value && REQUIRED_TIER_SET.has(value as ProductRequiredTier)) {
    return value as ProductRequiredTier;
  }
  return "FIXED_1";
}

function assertProductRow(row: ProductImportRow, index: number): string[] {
  const errors: string[] = [];
  if (!row.sku) errors.push(`第 ${index} 筆：缺少 sku`);
  if (!row.name) errors.push(`第 ${index} 筆：缺少 name`);
  if (row.type === "NORMAL" && !row.character) errors.push(`第 ${index} 筆：一般商品缺少 character`);
  if (row.slotRestrictionEnabled && !row.slotRestrictedCharacter) {
    errors.push(`第 ${index} 筆：啟用固位限制時缺少 slotRestrictedCharacter`);
  }
  if (row.type === "NORMAL" && row.stock === null) {
    errors.push(`第 ${index} 筆：一般商品缺少 stock`);
  }
  return errors;
}

export function parseProductImportCsv(text: string): { rows: ProductImportRow[]; errors: string[] } {
  const rawRows = parseCsv(text);
  const rows: ProductImportRow[] = [];
  const errors: string[] = [];

  rawRows.forEach((raw, idx) => {
    const row: ProductImportRow = {
      sku: (raw.sku ?? "").trim(),
      name: (raw.name ?? "").trim(),
      series: toProductSeries(raw.series),
      type: toProductType(raw.type),
      character: toCharacter(raw.character),
      slotRestrictionEnabled: parseBoolean(raw.slotRestrictionEnabled, true),
      slotRestrictedCharacter: toCharacter(raw.slotRestrictedCharacter),
      requiredTier: toRequiredTier(raw.requiredTier),
      imageUrl: raw.imageUrl?.trim() ? raw.imageUrl.trim() : null,
      isPopular: parseBoolean(raw.isPopular),
      hotPrice: Number(raw.hotPrice ?? 0),
      coldPrice: Number(raw.coldPrice ?? 0),
      averagePrice: Number(raw.averagePrice ?? 0),
      stock: parseNullableNumber(raw.stock),
      maxPerUser: parseNullableNumber(raw.maxPerUser),
    };

    const rowErrors = assertProductRow(row, idx + 1);
    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }
    rows.push(row);
  });

  return { rows, errors };
}

export function parseProductImportJson(text: string): { rows: ProductImportRow[]; errors: string[] } {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return { rows: [], errors: ["JSON 必須是陣列。"] };
    }

    const rows: ProductImportRow[] = [];
    const errors: string[] = [];

    parsed.forEach((raw, idx) => {
      const item = raw as Record<string, unknown>;
      const row: ProductImportRow = {
        sku: String(item.sku ?? "").trim(),
        name: String(item.name ?? "").trim(),
        series: toProductSeries(String(item.series ?? "")),
        type: toProductType(String(item.type ?? "")),
        character: toCharacter(typeof item.character === "string" ? item.character : undefined),
        slotRestrictionEnabled: typeof item.slotRestrictionEnabled === "boolean" ? item.slotRestrictionEnabled : true,
        slotRestrictedCharacter: toCharacter(typeof item.slotRestrictedCharacter === "string" ? item.slotRestrictedCharacter : undefined),
        requiredTier: toRequiredTier(typeof item.requiredTier === "string" ? item.requiredTier : undefined),
        imageUrl: typeof item.imageUrl === "string" && item.imageUrl.trim() ? item.imageUrl.trim() : null,
        isPopular: Boolean(item.isPopular),
        hotPrice: Number(item.hotPrice ?? 0),
        coldPrice: Number(item.coldPrice ?? 0),
        averagePrice: Number(item.averagePrice ?? 0),
        stock: item.stock === null || item.stock === undefined ? null : Number(item.stock),
        maxPerUser: item.maxPerUser === null || item.maxPerUser === undefined ? null : Number(item.maxPerUser),
      };

      const rowErrors = assertProductRow(row, idx + 1);
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
    const stock = Number(raw.stock ?? 0);
    const row: BlindBoxItemImportRow = {
      parentSku: (raw.parentSku ?? "").trim(),
      sku: (raw.sku ?? "").trim(),
      name: (raw.name ?? "").trim(),
      character: (character ?? "八千代") as CharacterName,
      imageUrl: raw.imageUrl?.trim() ? raw.imageUrl.trim() : null,
      stock: Number.isFinite(stock) ? stock : 0,
      maxPerUser: parseNullableNumber(raw.maxPerUser),
    };

    if (!row.parentSku || !row.sku || !row.name || !character) {
      errors.push(`第 ${idx + 1} 筆：parentSku/sku/name/character 必填`);
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
        stock: Number(item.stock ?? 0),
        maxPerUser: item.maxPerUser === null || item.maxPerUser === undefined ? null : Number(item.maxPerUser),
      };

      if (!row.parentSku || !row.sku || !row.name) {
        errors.push(`第 ${idx + 1} 筆：parentSku/sku/name 必填`);
        return;
      }

      rows.push(row);
    });

    return { rows, errors };
  } catch {
    return { rows: [], errors: ["JSON 格式錯誤。"] };
  }
}

export const PRODUCT_IMPORT_CSV_TEMPLATE = `sku,name,series,type,character,slotRestrictionEnabled,slotRestrictedCharacter,requiredTier,imageUrl,isPopular,hotPrice,coldPrice,averagePrice,stock,maxPerUser\nSUM-100,夏祭立牌A,Q版系列,NORMAL,八千代,true,八千代,FIXED_1,https://example.com/a.jpg,true,160,120,140,8,2`;

export const BLIND_ITEM_IMPORT_CSV_TEMPLATE = `parentSku,sku,name,character,imageUrl,stock,maxPerUser\nSUM-B01,SUM-B01-10,盲盒-八千代,八千代,https://example.com/y.jpg,3,1`;
