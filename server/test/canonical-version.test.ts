import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createRuntimeApp } from "../src/runtime.js";

describe("canonical runtime version", () => {
  it("creates new runs from the canonical 4x6 content bundle", async () => {
    const app = await createRuntimeApp({
      contentPath: fileURLToPath(new URL("../../content/alpha-0.4.0/bundle.json", import.meta.url)),
      actorId: "canonical-player",
      tenantId: "canonical-tenant",
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/runs",
      payload: { id: "canonical-run", content_version: "alpha-0.4.0" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ contentVersion: "alpha-0.4.0", board: Array(12).fill(null), shop: expect.any(Array) });
    expect(response.json().data.shop).toHaveLength(5);
    await app.close();
  });

  it("rejects unsupported content versions before creating a run", async () => {
    const app = await createRuntimeApp({
      contentPath: fileURLToPath(new URL("../../content/alpha-0.4.0/bundle.json", import.meta.url)),
      actorId: "canonical-player",
      tenantId: "canonical-tenant-reject",
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/runs",
      payload: { id: "unsupported-run", content_version: "alpha-9.9.9" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("CONTENT_VERSION_NOT_FOUND");
    await app.close();
  });
});
