import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

assert.equal(pkg.name, "shotkit", "npm package name must stay unscoped");
assert.equal(pkg.bin?.shotkit, "bin/shotkit.js", "shotkit bin must point at bin/shotkit.js");
assert.ok(Array.isArray(pkg.files), "package files allowlist is required");

const requiredFiles = [
  "package.json",
  "README.md",
  "README.ko.md",
  "LICENSE",
  "src/index.js",
  "bin/shotkit.js",
  "skills/capture/SKILL.md",
  "docs/handoff-conventions.md",
  "schemas/shotkit-manifest.schema.json",
];

for (const relpath of requiredFiles) {
  assert.ok(existsSync(join(root.pathname, relpath)), `required package source is missing: ${relpath}`);
}

const packed = spawnSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: root,
  encoding: "utf8",
});
if (packed.status !== 0) {
  process.stderr.write(packed.stderr);
  process.stderr.write(packed.stdout);
  process.exit(packed.status ?? 1);
}

const [manifest] = JSON.parse(packed.stdout);
assert.equal(manifest.name, "shotkit", "pack output must use the unscoped shotkit name");
const packedPaths = new Set(manifest.files.map((file) => file.path));
for (const relpath of requiredFiles) {
  assert.ok(packedPaths.has(relpath), `npm pack output is missing ${relpath}`);
}

for (const packedPath of packedPaths) {
  assert.ok(
    /^(package\.json|README\.md|README\.ko\.md|LICENSE|src\/|bin\/|skills\/capture\/|docs\/handoff-conventions\.md|schemas\/)/.test(packedPath),
    `unexpected file in npm pack output: ${packedPath}`,
  );
}

console.log(`package surface looks good (${manifest.entryCount} packed files).`);
