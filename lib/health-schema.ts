import { z } from "zod";

export const LiveResponseSchema = z.object({
  data: z.object({ status: z.literal("ok") }),
});
export const ReadyResponseSchema = z.object({
  data: z.object({ status: z.literal("ready") }),
});
export const ServiceUnavailableSchema = z.object({
  error: z.object({
    code: z.literal("SERVICE_UNAVAILABLE"),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())),
    requestId: z.string().uuid(),
  }),
});
