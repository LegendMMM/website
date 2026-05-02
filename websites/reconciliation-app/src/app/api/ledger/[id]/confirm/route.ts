import { NextRequest, NextResponse } from "next/server";
import { isResponse, jsonError, requireApiSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (isResponse(session)) return session;
  const { id } = await context.params;
  const entry = await prisma.ledgerEntry.findUnique({ where: { id } });

  if (!entry) return jsonError("Entry not found", 404);
  if (entry.createdById === session.id) return jsonError("The other party must confirm this entry", 409);

  const updated = await prisma.ledgerEntry.update({
    where: { id },
    data: { status: "CONFIRMED", confirmedById: session.id, confirmedAt: new Date(), rejectionReason: null },
  });
  return NextResponse.json({ entry: updated });
}
