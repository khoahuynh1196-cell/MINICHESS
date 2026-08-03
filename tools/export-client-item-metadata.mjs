import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const sourcePath = new URL("../content/alpha-0.3.0/bundle.json", import.meta.url);
const outputPath = new URL("../client-godot/assets/content/item_metadata.json", import.meta.url);
const bundle = JSON.parse(readFileSync(sourcePath, "utf8"));
const items = Object.fromEntries([...bundle.normal_items, ...bundle.unique_items].map((item) => [item.id, {
  name: item.name,
  kind: item.kind,
  category: item.category ?? "unique",
  stat_modifiers: item.stat_modifiers ?? [],
  triggers: item.triggers ?? item.rules ?? [],
  suggested_holder_tags: item.suggested_holder_tags ?? [],
}]));

mkdirSync(new URL(".", outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({ source_version: bundle.version, items }, null, 2)}\n`);
