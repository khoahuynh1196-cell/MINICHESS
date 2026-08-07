import type { CompiledContentBundle } from "../content/types.js";
import type { CompiledRuleset } from "../rules/types.js";
import { assertContentRulesetCompatibility } from "./content-ruleset.js";

export interface VersionedArtifactRef {
  readonly version: string;
  readonly hash: string;
}

export interface AssetRevisionRef {
  readonly revision: string;
}

export interface CompiledOfflineRelease {
  readonly version: string;
  readonly mode: "adventure";
  readonly ruleset: VersionedArtifactRef;
  readonly content: VersionedArtifactRef;
  readonly assets: AssetRevisionRef;
  readonly minimumClientSchema: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireHash(value: unknown, label: string): string {
  const hash = requireString(value, label);
  if (!/^[0-9a-f]+$/.test(hash) || (hash.length !== 16 && hash.length !== 64)) {
    throw new Error(`${label} must be a 16- or 64-character lowercase hexadecimal digest`);
  }
  return hash;
}

function requireInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

function compileVersionedArtifact(value: unknown, label: string): VersionedArtifactRef {
  const raw = requireRecord(value, label);
  return Object.freeze({
    version: requireString(raw.version, `${label}.version`),
    hash: requireHash(raw.hash, `${label}.hash`),
  });
}

export function compileOfflineRelease(value: unknown): CompiledOfflineRelease {
  const raw = requireRecord(value, "release");
  if (raw.mode !== "adventure") throw new Error("release.mode must be adventure");
  const assets = requireRecord(raw.assets, "release.assets");
  return Object.freeze({
    version: requireString(raw.version, "release.version"),
    mode: "adventure",
    ruleset: compileVersionedArtifact(raw.ruleset, "release.ruleset"),
    content: compileVersionedArtifact(raw.content, "release.content"),
    assets: Object.freeze({ revision: requireString(assets.revision, "release.assets.revision") }),
    minimumClientSchema: requireInteger(raw.minimum_client_schema, "release.minimum_client_schema", 1),
  });
}

export interface ReleaseCompatibilityInput {
  readonly release: CompiledOfflineRelease;
  readonly rules: CompiledRuleset;
  readonly content: CompiledContentBundle;
  readonly assetRevision: string;
  readonly clientSchema: number;
}

export function assertOfflineReleaseCompatibility(input: ReleaseCompatibilityInput): void {
  const { release, rules, content } = input;
  if (release.ruleset.version !== rules.version) {
    throw new Error(`RELEASE_RULESET_VERSION_MISMATCH:${release.ruleset.version}:${rules.version}`);
  }
  if (release.ruleset.hash !== rules.rulesetHash) {
    throw new Error(`RELEASE_RULESET_HASH_MISMATCH:${release.ruleset.hash}:${rules.rulesetHash}`);
  }
  if (release.content.version !== content.version) {
    throw new Error(`RELEASE_CONTENT_VERSION_MISMATCH:${release.content.version}:${content.version}`);
  }
  if (release.content.hash !== content.contentHash) {
    throw new Error(`RELEASE_CONTENT_HASH_MISMATCH:${release.content.hash}:${content.contentHash}`);
  }
  if (release.assets.revision !== input.assetRevision) {
    throw new Error(`RELEASE_ASSET_REVISION_MISMATCH:${release.assets.revision}:${input.assetRevision}`);
  }
  if (!Number.isSafeInteger(input.clientSchema) || input.clientSchema < release.minimumClientSchema) {
    throw new Error(`RELEASE_CLIENT_SCHEMA_UNSUPPORTED:${input.clientSchema}:${release.minimumClientSchema}`);
  }
  assertContentRulesetCompatibility(content, rules, release.ruleset.version);
}
