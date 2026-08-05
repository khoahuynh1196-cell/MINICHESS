import { mkdir, readFile, writeFile } from "node:fs/promises";

const sourceUrl = new URL("../content/alpha-0.3.0/bundle.json", import.meta.url);
const outputDir = new URL("../content/alpha-0.4.0/", import.meta.url);
const source = JSON.parse(await readFile(sourceUrl, "utf8"));

export function migratePosition(position) {
  if (!Number.isInteger(position) || position < 0 || position >= 12) {
    throw new Error(`Legacy enemy position is invalid: ${position}`);
  }
  return Math.floor(position / 3) * 4 + (position % 3);
}

const migrated = {
  ...source,
  version: "alpha-0.4.0",
  encounters: source.encounters.map((encounter) => ({
    ...encounter,
    ...(encounter.enemy_composition === undefined ? {} : {
      enemy_composition: encounter.enemy_composition.map((enemy) => ({
        ...enemy,
        position: migratePosition(enemy.position),
      })),
    }),
  })),
};

await mkdir(outputDir, { recursive: true });
await writeFile(new URL("bundle.json", outputDir), `${JSON.stringify(migrated, null, 2)}\n`);
