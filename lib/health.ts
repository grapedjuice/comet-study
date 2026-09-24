import { randomUUID } from "node:crypto";
import {
  LiveResponseSchema,
  ReadyResponseSchema,
  ServiceUnavailableSchema,
} from "./health-schema";

export function liveness() {
  return {
    status: 200,
    body: LiveResponseSchema.parse({ data: { status: "ok" } }),
  } as const;
}

export async function readiness(check: () => Promise<boolean>) {
  try {
    if (await check()) {
      return {
        status: 200,
        body: ReadyResponseSchema.parse({ data: { status: "ready" } }),
      } as const;
    }
  } catch {
    // Dependency failures are intentionally redacted at this public boundary.
  }
  return {
    status: 503,
    body: ServiceUnavailableSchema.parse({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Service is not ready",
        fieldErrors: {},
        requestId: randomUUID(),
      },
    }),
  } as const;
}
