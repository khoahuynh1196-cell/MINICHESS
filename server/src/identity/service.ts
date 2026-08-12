import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export interface IdentityServiceOptions { readonly clock?: () => number; readonly tokenSecret: string; readonly accessTtlMs?: number; readonly refreshTtlMs?: number; }
export interface GuestIdentity { readonly playerId: string; readonly accessToken: string; readonly refreshToken: string; readonly accessExpiresAt: number; readonly refreshExpiresAt: number; }
interface Session { readonly playerId: string; readonly deviceId: string; accessId: string; refreshId: string; accessExpiresAt: number; refreshExpiresAt: number; revoked: boolean; }
interface Claims { readonly kind: "access" | "refresh"; readonly playerId: string; readonly tokenId: string; readonly expiresAt: number; }

const ACCESS_PREFIX = "ab_access";
const REFRESH_PREFIX = "ab_refresh";

function encode(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decode(value: string): unknown { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }

export function createIdentityService(options: IdentityServiceOptions) {
  const now = options.clock ?? Date.now;
  const accessTtlMs = options.accessTtlMs ?? 15 * 60_000;
  const refreshTtlMs = options.refreshTtlMs ?? 30 * 24 * 60 * 60_000;
  const sessions = new Map<string, Session>();
  const sign = (kind: Claims["kind"], playerId: string, tokenId: string, expiresAt: number): string => {
    const payload = encode({ kind, playerId, tokenId, expiresAt });
    const signature = createHmac("sha256", options.tokenSecret).update(payload).digest("base64url");
    return `${kind === "access" ? ACCESS_PREFIX : REFRESH_PREFIX}.${payload}.${signature}`;
  };
  const parse = (token: string, expectedKind: Claims["kind"]): Claims => {
    if (typeof token !== "string" || token.length === 0) throw new Error("INVALID_TOKEN");
    const [prefix, payload, signature] = token.split(".");
    if (prefix !== (expectedKind === "access" ? ACCESS_PREFIX : REFRESH_PREFIX) || payload === undefined || signature === undefined) throw new Error("INVALID_TOKEN");
    const expected = createHmac("sha256", options.tokenSecret).update(payload).digest("base64url");
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("INVALID_TOKEN");
    let claims: Partial<Claims>;
    try { claims = decode(payload) as Partial<Claims>; } catch { throw new Error("INVALID_TOKEN"); }
    if (claims.kind !== expectedKind || typeof claims.playerId !== "string" || typeof claims.tokenId !== "string" || typeof claims.expiresAt !== "number" || claims.expiresAt <= now()) throw new Error("TOKEN_EXPIRED");
    return claims as Claims;
  };
  const issue = (session: Session): GuestIdentity => Object.freeze({
    playerId: session.playerId,
    accessToken: sign("access", session.playerId, session.accessId, session.accessExpiresAt),
    refreshToken: sign("refresh", session.playerId, session.refreshId, session.refreshExpiresAt),
    accessExpiresAt: session.accessExpiresAt,
    refreshExpiresAt: session.refreshExpiresAt,
  });
  return Object.freeze({
    createGuest(input: { readonly deviceId: string }): GuestIdentity {
      if (typeof input?.deviceId !== "string" || !input.deviceId.trim()) throw new Error("DEVICE_ID_REQUIRED");
      const createdAt = now();
      const session: Session = { playerId: `guest_${randomUUID()}`, deviceId: input.deviceId, accessId: randomBytes(18).toString("hex"), refreshId: randomBytes(24).toString("hex"), accessExpiresAt: createdAt + accessTtlMs, refreshExpiresAt: createdAt + refreshTtlMs, revoked: false };
      sessions.set(session.playerId, session);
      return issue(session);
    },
    verifyAccess(token: string): { readonly playerId: string } {
      const claims = parse(token, "access");
      const session = sessions.get(claims.playerId);
      if (session === undefined || session.revoked || session.accessId !== claims.tokenId) throw new Error("IDENTITY_REVOKED");
      return { playerId: session.playerId };
    },
    rotateRefresh(token: string): GuestIdentity {
      const claims = parse(token, "refresh");
      const session = sessions.get(claims.playerId);
      if (session === undefined || session.revoked || session.refreshId !== claims.tokenId) throw new Error("REFRESH_TOKEN_REVOKED");
      const issuedAt = now();
      session.refreshId = randomBytes(24).toString("hex");
      session.accessId = randomBytes(18).toString("hex");
      session.accessExpiresAt = issuedAt + accessTtlMs;
      session.refreshExpiresAt = issuedAt + refreshTtlMs;
      return issue(session);
    },
    revoke(playerId: string): void { const session = sessions.get(playerId); if (session !== undefined) session.revoked = true; },
  });
}
