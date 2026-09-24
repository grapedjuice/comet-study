import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import {
  LiveResponseSchema,
  ReadyResponseSchema,
  ServiceUnavailableSchema,
} from "../lib/health-schema";

const document = {
  openapi: "3.1.0",
  info: { title: "Comet Study implemented API", version: "0.1.0" },
  paths: {
    "/api/v1/auth/request-verification": {
      post: {
        operationId: "requestVerification",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["email"],
                properties: { email: { type: "string", format: "email" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Verification delivery queued" },
          "422": { description: "Malformed or ineligible email" },
          "503": { description: "Email or database unavailable" },
        },
      },
    },
    "/api/v1/health/live": {
      get: {
        operationId: "getLiveness",
        responses: {
          "200": {
            description: "Process is live",
            content: {
              "application/json": {
                schema: z.toJSONSchema(LiveResponseSchema),
              },
            },
          },
        },
      },
    },
    "/api/v1/health/ready": {
      get: {
        operationId: "getReadiness",
        responses: {
          "200": {
            description: "Database and migration journal are ready",
            content: {
              "application/json": {
                schema: z.toJSONSchema(ReadyResponseSchema),
              },
            },
          },
          "503": {
            description: "Dependency is unavailable or schema is stale",
            content: {
              "application/json": {
                schema: z.toJSONSchema(ServiceUnavailableSchema),
              },
            },
          },
        },
      },
    },
  },
};

const path = resolve("docs/api/openapi.json");
const generated = JSON.stringify(document, null, 2) + "\n";
if (process.argv.includes("--check")) {
  const existing = await readFile(path, "utf8").catch(() => "");
  if (existing !== generated) {
    console.error("Generated OpenAPI document is missing or stale");
    process.exitCode = 1;
  }
} else {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, generated);
  console.log("OpenAPI document generated");
}
