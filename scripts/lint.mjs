#!/usr/bin/env node
/**
 * Local static analysis entrypoint (mirrors .github/workflows/static-analysis.yml).
 * Agents and humans should run `npm run lint` before committing.
 */
import { spawnSync } from "node:child_process";

let failed = false;

function run(label, args, env = {}) {
  console.log(`\n==== ${label} ====`);
  const result = spawnSync("npm", ["run", ...args], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    failed = true;
    console.error(`FAILED: ${label}`);
  }
}

run("Terraform lint", ["lint:terraform"]);
// Match CI Site check: dummy SITE_* so astro check works without Key Vault / .env.
run("Astro check", ["check"], {
  SITE_CONTACT_EMAIL: process.env.SITE_CONTACT_EMAIL || "check@example.com",
  SITE_CONTACT_PHONE: process.env.SITE_CONTACT_PHONE || "000-000-0000",
  SITE_DATE_OF_BIRTH: process.env.SITE_DATE_OF_BIRTH || "2000-01-01",
});
run("API syntax", ["lint:api"]);

if (failed) {
  console.error("\nStatic analysis failed. Fix the issues above before committing.");
  process.exit(1);
}

console.log("\nStatic analysis passed.");
