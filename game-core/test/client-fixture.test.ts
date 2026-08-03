import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixturePath = fileURLToPath(
  new URL("../../client-godot/fixtures/combat-replay.json", import.meta.url),
);

describe("Godot combat replay fixture", () => {
  it("provides ordered events from combat start through combat end", () => {
    expect(existsSync(fixturePath)).toBe(true);
    if (!existsSync(fixturePath)) {
      return;
    }

    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      events: Array<{ sequence: number; tick: number; type: string; target_unit_id?: string }>;
    };

    expect(fixture.events.map((event) => event.sequence)).toEqual(
      Array.from({ length: fixture.events.length }, (_, i) => i),
    );
    expect(fixture.events[0]).toMatchObject({ tick: 0, type: "COMBAT_STARTED" });
    expect(fixture.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "DAMAGE_APPLIED", target_unit_id: "player:H01:1" }),
    ]));
    expect(fixture.events.at(-1)).toMatchObject({ type: "COMBAT_ENDED" });
  });
});