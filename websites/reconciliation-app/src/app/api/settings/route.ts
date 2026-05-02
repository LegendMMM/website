import { NextRequest, NextResponse } from "next/server";
import { isResponse, jsonError, requireApiSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireApiSession();
  if (isResponse(session)) return session;

  const settings = await prisma.exchangeFeeSetting.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    settings: settings ?? {
      id: "default",
      jpyPerTwd: 4.85,
      wiseFixedFeeJpy: 120,
      wisePercentFee: 0.007,
    },
  });
}

export async function PUT(request: NextRequest) {
  const session = await requireApiSession();
  if (isResponse(session)) return session;
  if (session.role !== "ADMIN") return jsonError("Forbidden", 403);

  const body = await request.json().catch(() => null);
  const settings = await prisma.exchangeFeeSetting.upsert({
    where: { id: "default" },
    update: {
      jpyPerTwd: Number(body?.jpyPerTwd ?? 4.85),
      wiseFixedFeeJpy: Number(body?.wiseFixedFeeJpy ?? 120),
      wisePercentFee: Number(body?.wisePercentFee ?? 0.007),
      updatedById: session.id,
    },
    create: {
      id: "default",
      jpyPerTwd: Number(body?.jpyPerTwd ?? 4.85),
      wiseFixedFeeJpy: Number(body?.wiseFixedFeeJpy ?? 120),
      wisePercentFee: Number(body?.wisePercentFee ?? 0.007),
      updatedById: session.id,
    },
  });
  return NextResponse.json({ settings });
}
