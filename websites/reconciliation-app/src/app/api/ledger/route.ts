import { NextRequest, NextResponse } from "next/server";
import type { Currency, EntryDirection, EntryType, WiseFeePolicy } from "@prisma/client";
import { isResponse, jsonError, requireApiSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireApiSession();
  if (isResponse(session)) return session;

  const entries = await prisma.ledgerEntry.findMany({
    include: { lineItems: true, createdBy: true, confirmedBy: true, settlementLinks: true },
    orderBy: { entryDate: "desc" },
  });
  return NextResponse.json({ entries });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (isResponse(session)) return session;

  const body = await request.json().catch(() => null);
  const lineItems = Array.isArray(body?.lineItems) ? body.lineItems : [];
  const cleanItems = lineItems
    .map((item: { label?: unknown; amount?: unknown; currency?: unknown }) => ({
      label: String(item.label ?? "").trim(),
      amount: Number(item.amount),
      currency: (item.currency === "TWD" ? "TWD" : "JPY") as Currency,
    }))
    .filter((item: { label: string; amount: number }) => item.label && Number.isFinite(item.amount) && item.amount > 0);

  if (!body?.title || cleanItems.length === 0) {
    return jsonError("title and at least one line item are required", 422);
  }

  const entry = await prisma.ledgerEntry.create({
    data: {
      type: String(body.type ?? "SHIPMENT") as EntryType,
      title: String(body.title),
      entryDate: new Date(String(body.entryDate ?? new Date().toISOString())),
      direction: String(body.direction ?? "PARTNER_TO_ADMIN") as EntryDirection,
      wiseFeePolicy: String(body.wiseFeePolicy ?? "SENDER") as WiseFeePolicy,
      trackingCode: body.trackingCode ? String(body.trackingCode) : null,
      externalRef: body.externalRef ? String(body.externalRef) : null,
      note: body.note ? String(body.note) : null,
      createdById: session.id,
      lineItems: {
        create: cleanItems.map((item: { label: string; amount: number; currency: Currency }) => ({
          label: item.label,
          amount: item.amount,
          currency: item.currency,
        })),
      },
    },
    include: { lineItems: true },
  });

  return NextResponse.json({ entry }, { status: 201 });
}
