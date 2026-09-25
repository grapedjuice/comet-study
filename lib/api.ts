import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

const noStore = { "Cache-Control": "no-store" };

export function ok<T>(data: T, init?: { status?: number }) {
  return NextResponse.json(
    { data },
    { status: init?.status ?? 200, headers: noStore },
  );
}

export function apiError(
  code: string,
  message: string,
  status: number,
  fieldErrors: Record<string, string> = {},
) {
  return NextResponse.json(
    { error: { code, message, fieldErrors, requestId: randomUUID() } },
    { status, headers: noStore },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/**
 * Reject cross-site form posts. Browsers always send Origin on POST; compare
 * it with the host the browser addressed (proxies and tunnels forward it),
 * not the server's internal URL.
 */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [
    request.headers.get("x-forwarded-host")?.split(",")[0].trim(),
    request.headers.get("host"),
    new URL(request.url).host,
  ];
  return hosts.some((host) => host && host === originHost);
}
