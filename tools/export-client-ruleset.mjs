import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, "rules", "production-0.1.0", "ruleset.json");
const targetPath = resolve(root, "client-godot", "assets", "rules", "production-rules-0.1.0.json");
const checkOnly = process.argv.includes("--check");

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const expected = `${JSON.stringify(source, null, 2)}\n`;

if (checkOnly) {
  let current = "";
  try {
    current = await readFile(targetPath, "utf8");
  } catch {
    console.error(`Missing generated client ruleset: ${targetPath}`);
    process.exitCode = 1;
  }
  if (current !== expected) {
    console.error("Client ruleset is stale. Run: node tools/export-client-ruleset.mjs");
    process.exitCode = 1;
  }
} else {
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, expected, "utf8");
  console.log(`Wrote ${targetPath}`);
}
