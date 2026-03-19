import { fixedTierLabel, roleLabel } from "../lib/format";
import type { CharacterSlot, CharacterTier, Product } from "../types/domain";

const FIXED_SLOT_PRIORITY: Record<CharacterTier, number> = {
  FIXED_1: 1,
  FIXED_2: 2,
  FIXED_3: 3,
  LEAK_PICK: 4,
};

export function formatCharacterSlotSummary(slots: CharacterSlot[]): string {
  const normalized = slots
    .slice()
    .sort(
      (a, b) =>
        FIXED_SLOT_PRIORITY[a.tier] - FIXED_SLOT_PRIORITY[b.tier]
        || a.character.localeCompare(b.character, "zh-Hant"),
    );

  const fixedSlots = normalized.filter((slot) => slot.tier !== "LEAK_PICK");
  if (fixedSlots.length > 0) {
    const preview = fixedSlots.slice(0, 3).map((slot) => `${slot.character} ${fixedTierLabel(slot.tier)}`);
    return fixedSlots.length > 3 ? `${preview.join("、")} 等 ${fixedSlots.length} 項` : preview.join("、");
  }

  const leakCount = normalized.filter((slot) => slot.tier === "LEAK_PICK").length;
  if (leakCount > 0) {
    return `撿漏 ${leakCount} 角`;
  }

  return "未分配";
}

export function formatClaimPrioritySummary(product: Product | undefined, roleTier: CharacterTier): string {
  if (!product?.slotRestrictionEnabled) {
    return "排單方式：一般代購 / 先喊先處理";
  }
  return `排單固位：${roleLabel(roleTier)}`;
}
