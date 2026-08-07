import type { CompiledContentBundle } from "../content/types.js";
import {
  assertOfflineReleaseCompatibility,
  type CompiledOfflineRelease,
} from "../compatibility/release.js";
import { sha256Hex, stableStringify } from "../serialization/canonical-json.js";
import type { CompiledRuleset } from "../rules/types.js";
import { freezeAdventureGameState, type AdventureGameState } from "./state.js";
import { assertAdventureGameState } from "./validation.js";

export const ADVENTURE_SAVE_SCHEMA = 1;

export interface AdventureSavePayload {
  readonly schema_version: number;
  readonly release_version: string;
  readonly asset_revision: string;
  readonly state: AdventureGameState;
}

export interface AdventureSaveEnvelope {
  readonly payload: AdventureSavePayload;
  readonly checksum: string;
}

export interface AdventureSaveContext {
  readonly release: CompiledOfflineRelease;
  readonly rules: CompiledRuleset;
  readonly content: CompiledContentBundle;
  readonly assetRevision: string;
  readonly clientSchema: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

function assertSaveContext(context: AdventureSaveContext): void {
  assertOfflineReleaseCompatibility({
    release: context.release,
    rules: context.rules,
    content: context.content,
    assetRevision: context.assetRevision,
    clientSchema: context.clientSchema,
  });
}

export function encodeAdventureSave(
  state: AdventureGameState,
  context: AdventureSaveContext,
): string {
  assertSaveContext(context);
  assertAdventureGameState(state, context.content, context.rules);
  const payload: AdventureSavePayload = Object.freeze({
    schema_version: ADVENTURE_SAVE_SCHEMA,
    release_version: context.release.version,
    asset_revision: context.assetRevision,
    state,
  });
  const envelope: AdventureSaveEnvelope = Object.freeze({ payload, checksum: sha256Hex(payload) });
  return stableStringify(envelope);
}

export function decodeAdventureSave(
  encoded: string,
  context: AdventureSaveContext,
): AdventureGameState {
  if (encoded.length === 0) throw new Error("Adventure save is empty");
  assertSaveContext(context);
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    throw new Error("Adventure save is not valid JSON");
  }
  const envelope = requireRecord(parsed, "save");
  const payloadRaw = requireRecord(envelope.payload, "save.payload");
  const checksum = requireString(envelope.checksum, "save.checksum");
  if (checksum !== sha256Hex(payloadRaw)) throw new Error("ADVENTURE_SAVE_CHECKSUM_MISMATCH");

  const schemaVersion = requireInteger(payloadRaw.schema_version, "save.payload.schema_version", 1);
  if (schemaVersion !== ADVENTURE_SAVE_SCHEMA) {
    throw new Error(`ADVENTURE_SAVE_SCHEMA_UNSUPPORTED:${schemaVersion}:${ADVENTURE_SAVE_SCHEMA}`);
  }
  const releaseVersion = requireString(payloadRaw.release_version, "save.payload.release_version");
  if (releaseVersion !== context.release.version) {
    throw new Error(`ADVENTURE_SAVE_RELEASE_MISMATCH:${releaseVersion}:${context.release.version}`);
  }
  const assetRevision = requireString(payloadRaw.asset_revision, "save.payload.asset_revision");
  if (assetRevision !== context.assetRevision) {
    throw new Error(`ADVENTURE_SAVE_ASSET_MISMATCH:${assetRevision}:${context.assetRevision}`);
  }
  if (!isRecord(payloadRaw.state)) throw new Error("save.payload.state must be an object");
  const state = freezeAdventureGameState(payloadRaw.state as unknown as AdventureGameState);
  assertAdventureGameState(state, context.content, context.rules);
  return state;
}
