export interface MatchTicket { readonly ticketId: string; readonly playerId: string; readonly region: string; readonly mode: string; }
export function createMatchmakingQueue() {
  const pending: MatchTicket[] = [];
  let nextTicketNumber = 1;
  return Object.freeze({
    enqueue(input: { readonly playerId: string; readonly region: string; readonly mode: string }): MatchTicket {
      if (!input.playerId || !input.region?.trim() || !input.mode?.trim()) throw new Error("MATCHMAKING_INPUT_REQUIRED");
      if (pending.some((ticket) => ticket.playerId === input.playerId)) throw new Error("MATCH_TICKET_EXISTS");
      const ticket = Object.freeze({ ticketId: `ticket_${nextTicketNumber++}_${input.playerId}`, ...input });
      pending.push(ticket);
      return ticket;
    },
    cancel(ticketId: string): boolean { const index = pending.findIndex((ticket) => ticket.ticketId === ticketId); if (index < 0) return false; pending.splice(index, 1); return true; },
    tryMatch(region: string, mode: string): { readonly seats: readonly string[]; readonly maxPlayers: 8 } | undefined { const candidates = pending.filter((ticket) => ticket.region === region && ticket.mode === mode).slice(0, 8); if (candidates.length < 8) return undefined; for (const ticket of candidates) pending.splice(pending.indexOf(ticket), 1); return { seats: candidates.map((ticket) => ticket.ticketId), maxPlayers: 8 }; },
  });
}
