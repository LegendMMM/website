"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type {
  Currency,
  EntryDirection,
  EntryType,
  Locale,
  Role,
  WiseFeePolicy,
} from "@prisma/client";
import { assertAdmin, clearSession, createSession, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateSettlementSummary, type SettlementLineItem } from "@/lib/settlement";

type LineItemInput = {
  label: string;
  amount: number;
  currency: Currency;
};

function stringValue(formData: FormData, key: string, fallback = "") {
  return String(formData.get(key) ?? fallback).trim();
}

function numberValue(formData: FormData, key: string, fallback = 0) {
  const value = Number(formData.get(key) ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function optionalString(formData: FormData, key: string) {
  const value = stringValue(formData, key);
  return value.length > 0 ? value : null;
}

function parseLineItems(raw: string): LineItemInput[] {
  const parsed = JSON.parse(raw) as LineItemInput[];
  return parsed
    .map((item) => ({
      label: String(item.label ?? "").trim(),
      amount: Number(item.amount),
      currency: (item.currency === "TWD" ? "TWD" : "JPY") as Currency,
    }))
    .filter((item) => item.label && Number.isFinite(item.amount) && item.amount > 0);
}

async function defaultSettings(updatedById?: string) {
  return prisma.exchangeFeeSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      jpyPerTwd: 4.85,
      wiseFixedFeeJpy: 120,
      wisePercentFee: 0.007,
      updatedById,
    },
  });
}

export async function loginAction(formData: FormData) {
  const email = stringValue(formData, "email").toLowerCase();
  const password = stringValue(formData, "password");
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    redirect("/login?error=invalid");
  }

  await createSession(user);
  redirect("/");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function updateLocaleAction(formData: FormData) {
  const session = await requireSession();
  const locale = stringValue(formData, "locale") === "JA" ? "JA" : "ZH_TW";
  const user = await prisma.user.update({
    where: { id: session.id },
    data: { locale: locale as Locale },
  });

  await createSession(user);
  revalidatePath("/", "layout");
  redirect(stringValue(formData, "returnTo", "/"));
}

export async function createUserAction(formData: FormData) {
  const session = await requireSession();
  assertAdmin(session);

  const email = stringValue(formData, "email").toLowerCase();
  const password = stringValue(formData, "password");
  const name = stringValue(formData, "name");
  const role = stringValue(formData, "role") === "ADMIN" ? "ADMIN" : "PARTNER";
  const locale = stringValue(formData, "locale") === "JA" ? "JA" : "ZH_TW";

  if (!email || !password || !name) {
    redirect("/accounts?error=missing");
  }

  await prisma.user.create({
    data: {
      email,
      name,
      role: role as Role,
      locale: locale as Locale,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });

  revalidatePath("/accounts");
  redirect("/accounts?created=1");
}

export async function changePasswordAction(formData: FormData) {
  const session = await requireSession();
  const currentPassword = stringValue(formData, "currentPassword");
  const nextPassword = stringValue(formData, "nextPassword");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });

  if (!nextPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    redirect("/accounts?password=invalid");
  }

  await prisma.user.update({
    where: { id: session.id },
    data: { passwordHash: await bcrypt.hash(nextPassword, 12) },
  });

  redirect("/accounts?password=changed");
}

export async function createLedgerEntryAction(formData: FormData) {
  const session = await requireSession();
  const items = parseLineItems(stringValue(formData, "lineItemsJson", "[]"));

  if (items.length === 0) {
    redirect("/entries/new?error=items");
  }

  await prisma.ledgerEntry.create({
    data: {
      type: stringValue(formData, "type") as EntryType,
      title: stringValue(formData, "title"),
      entryDate: new Date(stringValue(formData, "entryDate")),
      direction: stringValue(formData, "direction") as EntryDirection,
      wiseFeePolicy: stringValue(formData, "wiseFeePolicy", "SENDER") as WiseFeePolicy,
      trackingCode: optionalString(formData, "trackingCode"),
      externalRef: optionalString(formData, "externalRef"),
      note: optionalString(formData, "note"),
      createdById: session.id,
      lineItems: {
        create: items.map((item) => ({
          label: item.label,
          amount: item.amount,
          currency: item.currency,
        })),
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/entries");
  revalidatePath("/pending");
  redirect("/entries?created=1");
}

export async function confirmLedgerEntryAction(formData: FormData) {
  const session = await requireSession();
  const id = stringValue(formData, "id");
  const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id } });

  if (entry.createdById === session.id) {
    redirect("/pending?error=own");
  }

  await prisma.ledgerEntry.update({
    where: { id },
    data: {
      status: "CONFIRMED",
      confirmedById: session.id,
      confirmedAt: new Date(),
      rejectionReason: null,
    },
  });

  revalidatePath("/");
  revalidatePath("/entries");
  revalidatePath("/pending");
}

export async function rejectLedgerEntryAction(formData: FormData) {
  const session = await requireSession();
  const id = stringValue(formData, "id");
  const reason = stringValue(formData, "reason", "需要重新確認");
  const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id } });

  if (entry.createdById === session.id) {
    redirect("/pending?error=own");
  }

  await prisma.ledgerEntry.update({
    where: { id },
    data: {
      status: "REJECTED",
      confirmedById: session.id,
      confirmedAt: new Date(),
      rejectionReason: reason,
    },
  });

  revalidatePath("/");
  revalidatePath("/entries");
  revalidatePath("/pending");
}

export async function updateSettingsAction(formData: FormData) {
  const session = await requireSession();
  assertAdmin(session);

  await prisma.exchangeFeeSetting.upsert({
    where: { id: "default" },
    update: {
      jpyPerTwd: numberValue(formData, "jpyPerTwd", 4.85),
      wiseFixedFeeJpy: numberValue(formData, "wiseFixedFeeJpy", 120),
      wisePercentFee: numberValue(formData, "wisePercentFee", 0.007),
      updatedById: session.id,
    },
    create: {
      id: "default",
      jpyPerTwd: numberValue(formData, "jpyPerTwd", 4.85),
      wiseFixedFeeJpy: numberValue(formData, "wiseFixedFeeJpy", 120),
      wisePercentFee: numberValue(formData, "wisePercentFee", 0.007),
      updatedById: session.id,
    },
  });

  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

export async function generateSettlementAction(formData: FormData) {
  const session = await requireSession();
  const startDate = new Date(stringValue(formData, "startDate"));
  const endDate = new Date(`${stringValue(formData, "endDate")}T23:59:59.999`);
  const feePolicy = stringValue(formData, "feePolicy", "SENDER") as WiseFeePolicy;
  const settings = await defaultSettings(session.id);
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      status: "CONFIRMED",
      entryDate: { gte: startDate, lte: endDate },
      settlementLinks: { none: {} },
    },
    include: { lineItems: true },
    orderBy: { entryDate: "asc" },
  });

  if (entries.length === 0) {
    redirect("/settlements?error=empty");
  }

  const inputItems: SettlementLineItem[] = entries.flatMap((entry) =>
    entry.lineItems.map((item) => ({
      id: item.id,
      amount: Number(item.amount),
      currency: item.currency,
      direction: entry.direction,
      confirmed: entry.status === "CONFIRMED",
      settled: false,
    })),
  );
  const summary = calculateSettlementSummary(inputItems, {
    jpyPerTwd: Number(settings.jpyPerTwd),
    wiseFee: {
      fixedJpy: Number(settings.wiseFixedFeeJpy),
      percent: Number(settings.wisePercentFee),
    },
    feePolicy,
  });
  const code = `SET-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;

  const settlement = await prisma.settlement.create({
    data: {
      code,
      startDate,
      endDate,
      exchangeRateJpyPerTwd: settings.jpyPerTwd,
      wiseFixedFeeJpy: settings.wiseFixedFeeJpy,
      wisePercentFee: settings.wisePercentFee,
      wiseFeePolicy: feePolicy,
      grossAmountJpy: summary.recommended.amountJpy,
      estimatedFeeJpy: summary.wiseFee.totalJpy,
      totalDueJpy: summary.recommended.amountJpy + summary.wiseFee.senderJpy,
      payerRole: summary.recommended.payer,
      payeeRole: summary.recommended.payee,
      createdById: session.id,
      entries: {
        create: entries.map((entry) => ({
          ledgerEntryId: entry.id,
        })),
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/settlements");
  redirect(`/settlements?created=${settlement.code}`);
}

export async function markSettlementPaidAction(formData: FormData) {
  const session = await requireSession();
  assertAdmin(session);

  await prisma.settlement.update({
    where: { id: stringValue(formData, "id") },
    data: {
      status: "PAID",
      actualTransferJpy: numberValue(formData, "actualTransferJpy"),
      actualWiseFeeJpy: numberValue(formData, "actualWiseFeeJpy"),
      paidAt: new Date(),
    },
  });

  revalidatePath("/");
  revalidatePath("/settlements");
}
