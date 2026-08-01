#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
let failed = false;

function collectJsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) collectJsFiles(full, out);
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

for (const file of collectJsFiles(join(root, "api", "src"))) {
  const rel = relative(root, file);
  console.log(`==> node --check ${rel}`);
  const result = spawnSync("node", ["--check", file], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
