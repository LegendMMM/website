import { NextRequest, NextResponse } from "next/server";
import type { WiseFeePolicy } from "@prisma/client";
import { isResponse, jsonError, requireApiSession } from "@/lib/api";
import { calculateSettlementSummary, type SettlementLineItem } from "@/lib/settlement";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireApiSession();
  if (isResponse(session)) return session;

  const settlements = await prisma.settlement.findMany({
    include: { entries: { include: { ledgerEntry: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ settlements });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (isResponse(session)) return session;

  const body = await request.json().catch(() => null);
  const startDate = new Date(String(body?.startDate));
  const endDate = new Date(`${String(body?.endDate)}T23:59:59.999`);
  const feePolicy = String(body?.feePolicy ?? "SENDER") as WiseFeePolicy;
  const settings = await prisma.exchangeFeeSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      jpyPerTwd: 4.85,
      wiseFixedFeeJpy: 120,
      wisePercentFee: 0.007,
      updatedById: session.id,
    },
  });
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
    return jsonError("No confirmed unsettled entries found", 422);
  }

  const items: SettlementLineItem[] = entries.flatMap((entry) =>
    entry.lineItems.map((item) => ({
      id: item.id,
      amount: Number(item.amount),
      currency: item.currency,
      direction: entry.direction,
      confirmed: true,
      settled: false,
    })),
  );
  const summary = calculateSettlementSummary(items, {
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
      entries: { create: entries.map((entry) => ({ ledgerEntryId: entry.id })) },
    },
    include: { entries: true },
  });

  return NextResponse.json({ settlement, summary }, { status: 201 });
}
