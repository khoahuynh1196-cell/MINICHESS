export type RealtimeEnvelope = { readonly type: "PING"; readonly sequence: number; readonly sentAt: number } | { readonly type: "COMMAND"; readonly sequence: number; readonly commandId: string; readonly payload: Record<string, unknown> };
export function createRealtimeSession(options: { readonly playerId: string; readonly now?: () => number }) {
  const now = options.now ?? Date.now;
  let lastSequence = 0;
  const commands = new Set<string>();
  let offset = 0;
  return Object.freeze({
    accept(envelope: RealtimeEnvelope): Record<string, unknown> {
      if (envelope.type === "COMMAND" && commands.has(envelope.commandId)) return { accepted: false, reason: "DUPLICATE_COMMAND" };
      if (!Number.isSafeInteger(envelope.sequence) || envelope.sequence <= lastSequence) throw new Error("SEQUENCE_OUT_OF_ORDER");
      lastSequence = envelope.sequence;
      if (envelope.type === "PING") { offset = now() - envelope.sentAt; return { type: "PONG", sequence: envelope.sequence, serverTime: now() }; }
      commands.add(envelope.commandId);
      return { accepted: true, commandId: envelope.commandId, payload: envelope.payload };
    },
    snapshot(): { readonly playerId: string; readonly lastSequence: number; readonly serverClockOffsetMs: number } { return { playerId: options.playerId, lastSequence, serverClockOffsetMs: offset }; },
  });
}
