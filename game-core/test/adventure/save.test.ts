import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyAdventureCommand,
  assertAdventureGameState,
  compileContentBundle,
  compileOfflineRelease,
  compileRuleset,
  createAdventureGame,
  decodeAdventureSave,
  encodeAdventureSave,
  freezeAdventureGameState,
  sha256Hex,
  stableStringify,
} from "../../src/index.js";

const releasePath = fileURLToPath(new URL("../../../releases/offline-foundation-0.1.0/release.json", import.meta.url));
const contentPath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const release = compileOfflineRelease(JSON.parse(readFileSync(releasePath, "utf8")));
const content = compileContentBundle(JSON.parse(readFileSync(contentPath, "utf8")));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));
const context = {
  release,
  rules,
  content,
  assetRevision: "original-chibi-cutouts-v3",
  clientSchema: 1,
};

function progressedState() {
  const initial = createAdventureGame({ id: "save-run", seed: "save-run-seed", content, rules });
  const bought = applyAdventureCommand(initial, {
    commandId: "buy", expectedRevision: 0, type: "BUY_SHOP_HERO", shopSlotIndex: 0,
  }, rules).state;
  return applyAdventureCommand(bought, {
    commandId: "move", expectedRevision: 1, type: "MOVE_HERO",
    heroInstanceId: "hero:save-run:buy", destination: { kind: "board", index: 5 },
  }, rules).state;
}

describe("checksummed Adventure saves", () => {
  it("round-trips a progressed immutable game state", () => {
    const state = progressedState();
    const encoded = encodeAdventureSave(state, context);
    const restored = decodeAdventureSave(encoded, context);

    expect(restored).toEqual(state);
    expect(Object.isFrozen(restored)).toBe(true);
    expect(Object.isFrozen(restored.run.board)).toBe(true);
    expect(() => assertAdventureGameState(restored, content, rules)).not.toThrow();
  });

  it("is deterministic for identical state and release inputs", () => {
    const state = progressedState();
    expect(encodeAdventureSave(state, context)).toBe(encodeAdventureSave(state, context));
  });

  it("rejects tampering before trusting the state", () => {
    const envelope = JSON.parse(encodeAdventureSave(progressedState(), context));
    envelope.payload.state.run.gold += 100;

    expect(() => decodeAdventureSave(JSON.stringify(envelope), context))
      .toThrow("ADVENTURE_SAVE_CHECKSUM_MISMATCH");
  });

  it("rejects stale release, asset, and schema declarations with valid checksums", () => {
    const source = JSON.parse(encodeAdventureSave(progressedState(), context));
    const staleRelease = structuredClone(source);
    staleRelease.payload.release_version = "offline-foundation-0.0.1";
    staleRelease.checksum = sha256Hex(staleRelease.payload);
    expect(() => decodeAdventureSave(stableStringify(staleRelease), context))
      .toThrow("ADVENTURE_SAVE_RELEASE_MISMATCH");

    const staleAsset = structuredClone(source);
    staleAsset.payload.asset_revision = "old-assets";
    staleAsset.checksum = sha256Hex(staleAsset.payload);
    expect(() => decodeAdventureSave(stableStringify(staleAsset), context))
      .toThrow("ADVENTURE_SAVE_ASSET_MISMATCH");

    const staleSchema = structuredClone(source);
    staleSchema.payload.schema_version = 2;
    staleSchema.checksum = sha256Hex(staleSchema.payload);
    expect(() => decodeAdventureSave(stableStringify(staleSchema), context))
      .toThrow("ADVENTURE_SAVE_SCHEMA_UNSUPPORTED:2:1");
  });

  it("rejects a re-signed state whose shared pool copies no longer conserve", () => {
    const envelope = JSON.parse(encodeAdventureSave(progressedState(), context));
    const heroId = Object.keys(envelope.payload.state.shopPool.entries)[0]!;
    envelope.payload.state.shopPool.entries[heroId].remainingCopies -= 1;
    envelope.checksum = sha256Hex(envelope.payload);

    expect(() => decodeAdventureSave(stableStringify(envelope), context))
      .toThrow(`Adventure shop pool conservation failed: ${heroId}`);
  });

  it("rejects malformed JSON and empty saves", () => {
    expect(() => decodeAdventureSave("", context)).toThrow("Adventure save is empty");
    expect(() => decodeAdventureSave("{", context)).toThrow("Adventure save is not valid JSON");
  });

  it("rejects invalid state even if it is frozen and correctly checksummed", () => {
    const state = progressedState();
    const invalid = freezeAdventureGameState({
      ...state,
      run: { ...state.run, health: rules.adventure.initialHealth + 1 },
    });
    expect(() => encodeAdventureSave(invalid, context))
      .toThrow("Adventure health exceeds its initial maximum");
  });
});
