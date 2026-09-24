import { NextResponse } from "next/server";
import { liveness } from "../../../../../lib/health";

export const dynamic = "force-dynamic";

export function GET() {
  const result = liveness();
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
