import { createIdentityService, type GuestIdentity } from "../identity/service.js";
import { createRealtimeSession, type RealtimeEnvelope } from "../realtime/session.js";
import { createMatchmakingQueue, type MatchTicket } from "../matchmaking/queue.js";
import { createRoomRegistry } from "../rooms/registry.js";
import { randomUUID } from "node:crypto";

export interface OnlineRuntimeOptions {
  readonly tokenSecret: string;
  readonly clock?: () => number;
}

export interface OnlineRuntime {
  readonly createGuest: (deviceId: string) => GuestIdentity;
  readonly rotateRefresh: (refreshToken: string) => GuestIdentity;
  readonly verifyAccess: (accessToken: string) => { readonly playerId: string };
  readonly revoke: (playerId: string) => void;
  readonly enqueue: (playerId: string, region: string, mode: string) => { readonly ticket: MatchTicket; readonly room?: ReturnType<ReturnType<typeof createRoomRegistry>["create"]> };
  readonly cancel: (playerId: string, ticketId: string) => boolean;
  readonly ticketStatus: (playerId: string, ticketId: string) => { readonly ticketId: string; readonly status: "QUEUED" | "MATCHED" | "CANCELLED"; readonly room?: ReturnType<ReturnType<typeof createRoomRegistry>["create"]> } | undefined;
  readonly roomForPlayer: (roomId: string, playerId: string) => ReturnType<ReturnType<typeof createRoomRegistry>["get"]> | undefined;
  readonly command: (roomId: string, playerId: string, input: { readonly fencingToken: number; readonly commandId: string; readonly type: "READY" }) => { readonly accepted: boolean; readonly reason?: string };
  readonly combatResult: (roomId: string, playerId: string, input: { readonly combatId: string; readonly resultHash: string }) => { readonly accepted: boolean; readonly reason?: string };
  readonly recover: (roomId: string, playerId: string, fencingToken: number) => ReturnType<ReturnType<typeof createRoomRegistry>["recover"]>;
  readonly realtime: (roomId: string, playerId: string, envelope: RealtimeEnvelope) => Record<string, unknown>;
  readonly realtimeSnapshot: (roomId: string, playerId: string) => Record<string, unknown>;
}

export function createOnlineRuntime(options: OnlineRuntimeOptions): OnlineRuntime {
  const identity = createIdentityService({ tokenSecret: options.tokenSecret, ...(options.clock === undefined ? {} : { clock: options.clock }) });
  const queue = createMatchmakingQueue();
  const rooms = createRoomRegistry(options.clock === undefined ? {} : { now: options.clock });
  const tickets = new Map<string, MatchTicket>();
  const ticketStatuses = new Map<string, { readonly ticket: MatchTicket; status: "QUEUED" | "MATCHED" | "CANCELLED"; room?: ReturnType<ReturnType<typeof createRoomRegistry>["create"]> }>();
  const roomPlayers = new Map<string, Set<string>>();
  const realtimeSessions = new Map<string, ReturnType<typeof createRealtimeSession>>();

  const roomForPlayer = (roomId: string, playerId: string) => {
    const members = roomPlayers.get(roomId);
    if (members === undefined || !members.has(playerId)) return undefined;
    return rooms.get(roomId);
  };

  return Object.freeze({
    createGuest: (deviceId: string) => identity.createGuest({ deviceId }),
    rotateRefresh: (refreshToken: string) => identity.rotateRefresh(refreshToken),
    verifyAccess: (accessToken: string) => identity.verifyAccess(accessToken),
    revoke: (playerId: string) => identity.revoke(playerId),
    enqueue(playerId: string, region: string, mode: string) {
      const activeTicket = [...ticketStatuses.values()].find((status) => status.ticket.playerId === playerId && status.status !== "CANCELLED");
      if (activeTicket !== undefined) throw new Error("MATCH_TICKET_EXISTS");
      const ticket = queue.enqueue({ playerId, region, mode });
      tickets.set(ticket.ticketId, ticket);
      ticketStatuses.set(ticket.ticketId, { ticket, status: "QUEUED" });
      const match = queue.tryMatch(region, mode);
      if (match === undefined) return { ticket };
      const players = match.seats.map((ticketId) => tickets.get(ticketId)?.playerId).filter((candidate): candidate is string => candidate !== undefined);
      if (players.length !== 8) throw new Error("MATCH_TICKET_NOT_FOUND");
      const room = rooms.create({ roomId: `room_${randomUUID().slice(0, 12)}`, players, region, mode });
      roomPlayers.set(room.roomId, new Set(players));
      for (const ticketId of match.seats) {
        const status = ticketStatuses.get(ticketId);
        if (status !== undefined) { status.status = "MATCHED"; status.room = room; }
        tickets.delete(ticketId);
      }
      return { ticket, room };
    },
    cancel(playerId: string, ticketId: string) {
      const ticket = tickets.get(ticketId);
      if (ticket === undefined || ticket.playerId !== playerId) return false;
      const cancelled = queue.cancel(ticketId);
      if (cancelled) {
        tickets.delete(ticketId);
        const status = ticketStatuses.get(ticketId);
        if (status !== undefined) status.status = "CANCELLED";
      }
      return cancelled;
    },
    ticketStatus(playerId: string, ticketId: string) {
      const status = ticketStatuses.get(ticketId);
      if (status === undefined || status.ticket.playerId !== playerId) return undefined;
      return { ticketId, status: status.status, ...(status.room === undefined ? {} : { room: status.room }) };
    },
    roomForPlayer,
    command(roomId: string, playerId: string, input: { readonly fencingToken: number; readonly commandId: string; readonly type: "READY" }) {
      if (roomForPlayer(roomId, playerId) === undefined) return { accepted: false, reason: "ROOM_NOT_FOUND" };
      return rooms.acceptCommand(roomId, { ...input, playerId });
    },
    combatResult(roomId: string, playerId: string, input: { readonly combatId: string; readonly resultHash: string }) {
      if (roomForPlayer(roomId, playerId) === undefined) return { accepted: false, reason: "ROOM_NOT_FOUND" };
      if (!input.combatId.trim() || !input.resultHash.trim()) return { accepted: false, reason: "INVALID_COMBAT_RESULT" };
      return { accepted: rooms.recordCombatResult(roomId, input) };
    },
    recover(roomId: string, playerId: string, fencingToken: number) {
      if (roomForPlayer(roomId, playerId) === undefined) throw new Error("ROOM_NOT_FOUND");
      return rooms.recover(roomId, { fencingToken });
    },
    realtime(roomId: string, playerId: string, envelope: RealtimeEnvelope) {
      if (roomForPlayer(roomId, playerId) === undefined) throw new Error("ROOM_NOT_FOUND");
      const key = `${roomId}:${playerId}`;
      let session = realtimeSessions.get(key);
      if (session === undefined) {
        session = createRealtimeSession({ playerId, ...(options.clock === undefined ? {} : { now: options.clock }) });
        realtimeSessions.set(key, session);
      }
      return session.accept(envelope);
    },
    realtimeSnapshot(roomId: string, playerId: string) {
      if (roomForPlayer(roomId, playerId) === undefined) throw new Error("ROOM_NOT_FOUND");
      const key = `${roomId}:${playerId}`;
      let session = realtimeSessions.get(key);
      if (session === undefined) {
        session = createRealtimeSession({ playerId, ...(options.clock === undefined ? {} : { now: options.clock }) });
        realtimeSessions.set(key, session);
      }
      return session.snapshot();
    },
  });
}
