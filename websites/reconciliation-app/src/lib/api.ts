import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth";
import { getSession } from "@/lib/auth";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireApiSession(): Promise<SessionUser | NextResponse> {
  const session = await getSession();
  if (!session) {
    return jsonError("Unauthorized", 401);
  }
  return session;
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
