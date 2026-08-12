import { readFileSync } from "node:fs";
import { compileContentBundle, type CompiledContentBundle } from "@auto-battler/game-core";
import { createInMemoryRunRepository, type CreateRunInput, type RunRepository, type ShopGenerator } from "./application/run-commands.js";
import { createShopPool, rollShop, type ShopPool } from "./application/shop-pool.js";
import { createHttpApp, type ContentManifestRepository } from "./http/app.js";
import type { OnlineRuntime } from "./online/runtime.js";

export interface RuntimeOptions {
  readonly contentPath: string;
  readonly actorId?: string;
  readonly tenantId?: string;
  readonly repository?: RunRepository;
  readonly onlineRuntime?: OnlineRuntime;
}

export function loadCompiledContent(contentPath: string): CompiledContentBundle {
  return compileContentBundle(JSON.parse(readFileSync(contentPath, "utf8")));
}

export function createContentShopGenerator(content: CompiledContentBundle): ShopGenerator {
  return Object.freeze({
    createPool: (input: Pick<CreateRunInput, "id" | "contentVersion"> & { readonly runSeed: string }) => createShopPool(content, input.runSeed),
    rollShop: (pool: ShopPool, input: { readonly round: number; readonly refreshNumber: number; readonly level: number }) => rollShop(pool, input.level, `shop:${input.round}:${input.refreshNumber}`),
  });
}

export function createStaticContentRepository(content: CompiledContentBundle): ContentManifestRepository {
  return Object.freeze({ getByVersion: async (version: string) => version === content.version ? content : undefined });
}

export async function createRuntimeApp(options: RuntimeOptions) {
  const content = loadCompiledContent(options.contentPath);
  const contentRepository = createStaticContentRepository(content);
  return createHttpApp(
    { actorId: options.actorId ?? "local-player", tenantId: options.tenantId ?? "local-tenant" },
    options.repository ?? createInMemoryRunRepository(),
    createContentShopGenerator(content),
    contentRepository,
    options.onlineRuntime,
  );
}

export async function startRuntimeServer(options: RuntimeOptions & { readonly host: string; readonly port: number }) {
  const app = await createRuntimeApp(options);
  await app.listen({ host: options.host, port: options.port });
  return app;
}
