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
    "/api/v1/auth/verify-email": {
      post: {
        operationId: "verifyEmail",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["token"],
                properties: { token: { type: "string", minLength: 1 } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Email verified and session cookie issued" },
          "403": { description: "Cross-site request rejected" },
          "422": { description: "Malformed, expired, or already used token" },
          "503": { description: "Database unavailable" },
        },
      },
    },
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
          "403": { description: "Cross-site request rejected" },
          "422": { description: "Malformed or ineligible email" },
          "429": { description: "Too many live links for this address" },
          "503": { description: "Email or database unavailable" },
        },
      },
    },
    "/api/v1/auth/session": {
      get: {
        operationId: "getSession",
        responses: {
          "200": {
            description:
              "Current signed-in user from the session cookie, or user: null",
          },
          "503": { description: "Database unavailable" },
        },
      },
    },
    "/api/v1/auth/sign-out": {
      post: {
        operationId: "signOut",
        responses: {
          "200": { description: "Session revoked and cookie cleared" },
          "403": { description: "Cross-site request rejected" },
        },
      },
    },
    "/api/v1/me": {
      patch: {
        operationId: "updateProfile",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["name"],
                properties: { name: { type: "string", maxLength: 40 } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Display name saved" },
          "401": { description: "Not signed in" },
          "422": { description: "Invalid name" },
        },
      },
    },
    "/api/v1/me/onboarding": {
      post: {
        operationId: "completeOnboarding",
        responses: {
          "200": { description: "Onboarding completed" },
          "401": { description: "Not signed in" },
          "422": { description: "Name or at least one course missing" },
        },
      },
    },
    "/api/v1/me/courses": {
      get: {
        operationId: "listMyCourses",
        responses: {
          "200": {
            description: "Current-term courses with classmate counts",
          },
          "401": { description: "Not signed in" },
        },
      },
      post: {
        operationId: "addMyCourses",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["courses"],
                properties: {
                  courses: {
                    type: "array",
                    minItems: 1,
                    maxItems: 12,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["code"],
                      properties: {
                        code: { type: "string" },
                        section: { type: ["string", "null"] },
                      },
                    },
                  },
                  source: { type: "string", enum: ["search", "import"] },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Courses added; unknown codes reported" },
          "401": { description: "Not signed in" },
          "422": { description: "Unknown course or term limit reached" },
        },
      },
    },
    "/api/v1/me/courses/{id}": {
      delete: {
        operationId: "removeMyCourse",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Course removed" },
          "401": { description: "Not signed in" },
          "404": { description: "Course not found" },
        },
      },
    },
    "/api/v1/me/courses/import": {
      post: {
        operationId: "previewCourseImport",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["text"],
                properties: { text: { type: "string", maxLength: 20000 } },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Course codes detected in pasted schedule text and verified against the catalog; nothing is stored",
          },
          "401": { description: "Not signed in" },
        },
      },
    },
    "/api/v1/courses/search": {
      get: {
        operationId: "searchCatalog",
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Matching UTD catalog courses" },
          "401": { description: "Not signed in" },
          "503": { description: "Catalog unavailable" },
        },
      },
    },
    "/api/v1/courses/sections": {
      get: {
        operationId: "listTermSections",
        parameters: [
          {
            name: "code",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Current-term sections from Nebula" },
          "401": { description: "Not signed in" },
          "404": { description: "Course not in catalog" },
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
