import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { startRuntimeServer } from "./runtime.js";
import { createPostgresRuntime } from "./infra/postgres-runtime.js";

function port(value: string | undefined): number {
  const parsed = Number(value ?? "3000");
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) throw new Error("PORT must be an integer between 1 and 65535");
  return parsed;
}

function defaultContentPath(): string {
  const candidates = [
    resolve(process.cwd(), "content", "alpha-0.4.0", "bundle.json"),
    resolve(process.cwd(), "..", "content", "alpha-0.4.0", "bundle.json"),
  ];
  const existing = candidates.find((candidate) => existsSync(candidate));
  if (existing === undefined) throw new Error("CONTENT_BUNDLE_PATH must point to bundle.json");
  return existing;
}

const contentPath = process.env.CONTENT_BUNDLE_PATH ?? defaultContentPath();
const postgresRuntime = process.env.DATABASE_URL === undefined ? undefined : createPostgresRuntime(process.env.DATABASE_URL);

startRuntimeServer({
  contentPath,
  host: process.env.HOST ?? "127.0.0.1",
  port: port(process.env.PORT),
  ...(process.env.LOCAL_ACTOR_ID === undefined ? {} : { actorId: process.env.LOCAL_ACTOR_ID }),
  ...(process.env.LOCAL_TENANT_ID === undefined ? {} : { tenantId: process.env.LOCAL_TENANT_ID }),
  ...(postgresRuntime === undefined ? {} : { repository: postgresRuntime.repository }),
}).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
