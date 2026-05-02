import { NextRequest, NextResponse } from "next/server";
import type { EntryDirection, EntryType, WiseFeePolicy } from "@prisma/client";
import { isResponse, jsonError, requireApiSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (isResponse(session)) return session;
  const { id } = await context.params;
  const entry = await prisma.ledgerEntry.findUnique({
    where: { id },
    include: { lineItems: true, createdBy: true, confirmedBy: true, settlementLinks: true },
  });

  if (!entry) {
    return jsonError("Entry not found", 404);
  }

  return NextResponse.json({ entry });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (isResponse(session)) return session;
  const { id } = await context.params;
  const entry = await prisma.ledgerEntry.findUnique({ where: { id }, include: { settlementLinks: true } });

  if (!entry) return jsonError("Entry not found", 404);
  if (entry.createdById !== session.id && session.role !== "ADMIN") return jsonError("Forbidden", 403);
  if (entry.settlementLinks.length > 0) return jsonError("Settled entries cannot be changed", 409);

  const body = await request.json().catch(() => null);
  const updated = await prisma.ledgerEntry.update({
    where: { id },
    data: {
      type: body?.type ? (String(body.type) as EntryType) : undefined,
      title: body?.title ? String(body.title) : undefined,
      entryDate: body?.entryDate ? new Date(String(body.entryDate)) : undefined,
      direction: body?.direction ? (String(body.direction) as EntryDirection) : undefined,
      wiseFeePolicy: body?.wiseFeePolicy ? (String(body.wiseFeePolicy) as WiseFeePolicy) : undefined,
      trackingCode: body?.trackingCode === undefined ? undefined : body.trackingCode ? String(body.trackingCode) : null,
      externalRef: body?.externalRef === undefined ? undefined : body.externalRef ? String(body.externalRef) : null,
      note: body?.note === undefined ? undefined : body.note ? String(body.note) : null,
      status: "PENDING",
      confirmedById: null,
      confirmedAt: null,
      rejectionReason: null,
    },
    include: { lineItems: true },
  });

  return NextResponse.json({ entry: updated });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (isResponse(session)) return session;
  const { id } = await context.params;
  const entry = await prisma.ledgerEntry.findUnique({ where: { id }, include: { settlementLinks: true } });

  if (!entry) return jsonError("Entry not found", 404);
  if (entry.createdById !== session.id && session.role !== "ADMIN") return jsonError("Forbidden", 403);
  if (entry.settlementLinks.length > 0) return jsonError("Settled entries cannot be deleted", 409);

  await prisma.ledgerEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
