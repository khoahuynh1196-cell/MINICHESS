import {
  CANONICAL_ASSET_MANIFEST_VERSION,
  CANONICAL_CONTENT_VERSION,
  CANONICAL_RULESET_VERSION,
} from "@auto-battler/game-core";

export interface SqlOnlineQueryResult<Row> {
  readonly rows: readonly Row[];
}

export interface SqlOnlinePersistenceClient {
  query(text: string, values: readonly unknown[]): Promise<SqlOnlineQueryResult<unknown>>;
  transaction<T>(work: (transaction: SqlOnlinePersistenceClient) => Promise<T>): Promise<T>;
}

export interface RefreshRotationInput {
  readonly currentTokenHash: string;
  readonly refreshId: string;
  readonly playerId: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
}

export interface RefreshRotationResult {
  readonly refreshId: string;
  readonly playerId: string;
}

export interface ClaimEightSeatMatchInput {
  readonly roomId: string;
  readonly region: string;
  readonly mode: string;
  readonly rulesetVersion: string;
  readonly contentVersion: string;
  readonly assetManifestVersion: string;
}

export interface ClaimedEightSeatMatch {
  readonly roomId: string;
  readonly playerIds: readonly string[];
}

export interface AcceptRoomCommandInput {
  readonly roomId: string;
  readonly playerId: string;
  readonly commandId: string;
  readonly fencingToken: number;
  readonly sequence: number;
  readonly payload: Record<string, unknown>;
}

export type RoomCommandResult =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: "ROOM_NOT_FOUND" | "FENCING_TOKEN_STALE" | "PLAYER_NOT_IN_ROOM" | "DUPLICATE_COMMAND" };

export interface RecoverRoomResult {
  readonly roomId: string;
  readonly fencingToken: number;
  readonly leaseExpiresAt?: string;
}

interface RefreshRow {
  readonly refresh_id: string;
  readonly player_id: string;
}

interface FencingRow {
  readonly fencing_token: number | string;
  readonly lease_expires_at?: string;
}

interface TicketRow {
  readonly ticket_id: string;
  readonly player_id: string;
}

function canonicalRoom(input: ClaimEightSeatMatchInput): void {
  if (
    input.rulesetVersion !== CANONICAL_RULESET_VERSION ||
    input.contentVersion !== CANONICAL_CONTENT_VERSION ||
    input.assetManifestVersion !== CANONICAL_ASSET_MANIFEST_VERSION
  ) {
    throw new Error("INCOMPATIBLE_ROOM_VERSION");
  }
}

/**
 * Server-only transactional persistence boundary for the online runtime.
 * Callers pass hashes, never raw access/refresh credentials. Every method is
 * deliberately small so a Postgres implementation can be replaced by a
 * Redis/Postgres adapter without changing HTTP or Godot contracts.
 */
export function createPostgresOnlinePersistence(client: SqlOnlinePersistenceClient) {
  return Object.freeze({
    async rotateRefreshSession(input: RefreshRotationInput): Promise<RefreshRotationResult | undefined> {
      return client.transaction(async (transaction) => {
        const claimed = await transaction.query(
          "update public.online_refresh_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null and expires_at > now() returning refresh_id, player_id",
          [input.currentTokenHash],
        );
        const row = claimed.rows[0] as RefreshRow | undefined;
        if (row === undefined) return undefined;
        if (row.player_id !== input.playerId) throw new Error("REFRESH_PLAYER_MISMATCH");
        await transaction.query(
          "insert into public.online_refresh_sessions (refresh_id, player_id, token_hash, expires_at, rotated_from) values ($1, $2, $3, $4, $5)",
          [input.refreshId, input.playerId, input.tokenHash, input.expiresAt, row.refresh_id],
        );
        return { refreshId: input.refreshId, playerId: row.player_id };
      });
    },

    async claimEightSeatMatch(input: ClaimEightSeatMatchInput): Promise<ClaimedEightSeatMatch | undefined> {
      canonicalRoom(input);
      return client.transaction(async (transaction) => {
        const selected = await transaction.query(
          "select ticket_id, player_id from public.online_match_tickets where region = $1 and mode = $2 and status = 'QUEUED' order by created_at, ticket_id limit 8 for update skip locked",
          [input.region, input.mode],
        );
        const tickets = selected.rows as readonly TicketRow[];
        const playerIds = tickets.map((ticket) => ticket.player_id);
        if (tickets.length !== 8 || new Set(playerIds).size !== 8) return undefined;
        await transaction.query(
          "insert into public.online_rooms (room_id, region, mode, ruleset_version, content_version, asset_manifest_version) values ($1, $2, $3, $4, $5, $6)",
          [input.roomId, input.region, input.mode, input.rulesetVersion, input.contentVersion, input.assetManifestVersion],
        );
        const seatValues: string[] = [];
        const seatParams: unknown[] = [];
        tickets.forEach((ticket, index) => {
          const offset = index * 3;
          seatValues.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
          seatParams.push(input.roomId, index, ticket.player_id);
        });
        await transaction.query(
          `insert into public.online_room_seats (room_id, seat_index, player_id) values ${seatValues.join(", ")}`,
          seatParams,
        );
        await transaction.query(
          "update public.online_match_tickets set status = 'MATCHED', room_id = $1 where ticket_id = any($2::uuid[])",
          [input.roomId, tickets.map((ticket) => ticket.ticket_id)],
        );
        return { roomId: input.roomId, playerIds };
      });
    },

    async acceptRoomCommand(input: AcceptRoomCommandInput): Promise<RoomCommandResult> {
      return client.transaction(async (transaction) => {
        const roomResult = await transaction.query(
          "select fencing_token from public.online_rooms where room_id = $1 for update",
          [input.roomId],
        );
        const room = roomResult.rows[0] as FencingRow | undefined;
        if (room === undefined) return { accepted: false, reason: "ROOM_NOT_FOUND" };
        if (Number(room.fencing_token) !== input.fencingToken) return { accepted: false, reason: "FENCING_TOKEN_STALE" };
        const member = await transaction.query(
          "select 1 from public.online_room_seats where room_id = $1 and player_id = $2",
          [input.roomId, input.playerId],
        );
        if (member.rows.length === 0) return { accepted: false, reason: "PLAYER_NOT_IN_ROOM" };
        const inserted = await transaction.query(
          "insert into public.online_room_commands (room_id, command_id, player_id, fencing_token, sequence, payload) values ($1, $2, $3, $4, $5, $6::jsonb) on conflict (room_id, command_id) do nothing returning command_id",
          [input.roomId, input.commandId, input.playerId, input.fencingToken, input.sequence, input.payload],
        );
        return inserted.rows.length === 0 ? { accepted: false, reason: "DUPLICATE_COMMAND" } : { accepted: true };
      });
    },

    async recoverRoom(input: { readonly roomId: string; readonly fencingToken: number }): Promise<RecoverRoomResult | undefined> {
      return client.transaction(async (transaction) => {
        const result = await transaction.query(
          "update public.online_rooms set fencing_token = fencing_token + 1, updated_at = now() where room_id = $1 and fencing_token = $2 returning fencing_token, lease_expires_at",
          [input.roomId, input.fencingToken],
        );
        const row = result.rows[0] as FencingRow | undefined;
        if (row === undefined) return undefined;
        return {
          roomId: input.roomId,
          fencingToken: Number(row.fencing_token),
          ...(row.lease_expires_at === undefined ? {} : { leaseExpiresAt: row.lease_expires_at }),
        };
      });
    },
  });
}
