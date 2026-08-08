#!/usr/bin/env node
/**
 * OPS-P2-003 — Lab FCP check for homepage (median over N cold loads).
 *
 * Soft by default: prints a warning and exits 0 when median exceeds 1.5s.
 * Set LAB_FCP_HARD=1 to fail the process (hard gate).
 *
 * Usage:
 *   BASE_URL=https://… node scripts/lab-fcp.mjs
 *   BASE_URL=https://… LAB_FCP_HARD=1 LAB_FCP_RUNS=5 node scripts/lab-fcp.mjs
 */

import { chromium } from "playwright";

const TARGET_MS = 1500;
const RUNS = Math.max(1, Number.parseInt(process.env.LAB_FCP_RUNS || "3", 10) || 3);
const HARD = process.env.LAB_FCP_HARD === "1";
const baseURL = process.env.BASE_URL?.replace(/\/$/, "");

if (!baseURL) {
  console.error("BASE_URL is required (e.g. https://your-staging-hostname.azurestaticapps.net)");
  process.exit(1);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

async function measureOnce(browser) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  try {
    await page.goto(`${baseURL}/`, { waitUntil: "load", timeout: 45_000 });
    // Allow late paint entries after load.
    await new Promise((r) => setTimeout(r, 500));
    const fcp = await page.evaluate(() => {
      const entry = performance.getEntriesByName("first-contentful-paint")[0];
      return entry && typeof entry.startTime === "number" ? entry.startTime : null;
    });
    return fcp;
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const samples = [];
  try {
    for (let i = 0; i < RUNS; i++) {
      const ms = await measureOnce(browser);
      if (ms == null) {
        console.warn(`Run ${i + 1}/${RUNS}: FCP unavailable`);
        continue;
      }
      samples.push(ms);
      console.log(`Run ${i + 1}/${RUNS}: FCP ${Math.round(ms)}ms`);
    }
  } finally {
    await browser.close();
  }

  if (samples.length === 0) {
    console.error("Lab FCP: no samples collected (paint timing unavailable).");
    process.exit(HARD ? 1 : 0);
  }

  const med = median(samples);
  const rounded = Math.round(med);
  console.log(
    `Lab FCP median ${rounded}ms over ${samples.length} run(s) (target < ${TARGET_MS}ms; ${HARD ? "hard" : "soft"} gate)`,
  );

  if (med > TARGET_MS) {
    const msg = `Lab FCP median ${rounded}ms exceeds ${TARGET_MS}ms policy (OPS-P2-003).`;
    if (HARD) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(`::warning::${msg}`);
    process.exit(0);
  }

  console.log("Lab FCP within policy.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
