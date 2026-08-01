#!/usr/bin/env node
/**
 * Local static analysis entrypoint (mirrors .github/workflows/static-analysis.yml).
 * Agents and humans should run `npm run lint` before committing.
 */
import { spawnSync } from "node:child_process";

let failed = false;

function run(label, args) {
  console.log(`\n==== ${label} ====`);
  const result = spawnSync("npm", ["run", ...args], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    failed = true;
    console.error(`FAILED: ${label}`);
  }
}

run("Terraform lint", ["lint:terraform"]);
run("Astro check", ["check"]);
run("API syntax", ["lint:api"]);

if (failed) {
  console.error("\nStatic analysis failed. Fix the issues above before committing.");
  process.exit(1);
}

console.log("\nStatic analysis passed.");
