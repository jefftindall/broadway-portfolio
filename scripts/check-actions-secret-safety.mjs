#!/usr/bin/env node
/**
 * Fail CI/local lint if GitHub Actions workflows look likely to leak secrets.
 *
 * Catches the failure mode that dumped GITHUB-APP-PRIVATE-KEY into Actions logs:
 * echoing a multiline value as a single `::add-mask::...` command only masks the
 * first line; remaining PEM lines print in cleartext.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const WORKFLOWS_DIR = join(ROOT, ".github", "workflows");
const MINT_SCRIPT = "scripts/mint-github-app-token.sh";

const errors = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.ya?ml$/i.test(name)) out.push(p);
  }
  return out;
}

function rel(p) {
  return relative(ROOT, p).replaceAll("\\", "/");
}

function addError(file, line, message) {
  errors.push(`${rel(file)}:${line}: ${message}`);
}

const files = walk(WORKFLOWS_DIR);

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);

  // Never commit PEM material into workflow files.
  lines.forEach((line, i) => {
    if (/BEGIN ([A-Z]+ )?PRIVATE KEY/.test(line) || /BEGIN OPENSSH PRIVATE KEY/.test(line)) {
      addError(file, i + 1, "Private key material must never appear in workflow files.");
    }
  });

  // Action inputs named private-key are echoed to the job log in the `with:` block.
  lines.forEach((line, i) => {
    if (/^\s*private-key\s*:/.test(line)) {
      addError(
        file,
        i + 1,
        "Do not pass private-key via action `with:` (logged in cleartext). Use scripts/mint-github-app-token.sh.",
      );
    }
  });

  // Inline Key Vault PEM fetch in workflows is forbidden — use the mint script.
  if (/GITHUB-APP-PRIVATE-KEY/.test(text) && !text.includes(MINT_SCRIPT)) {
    const lineNo = lines.findIndex((l) => l.includes("GITHUB-APP-PRIVATE-KEY")) + 1;
    addError(
      file,
      lineNo || 1,
      `GITHUB-APP-PRIVATE-KEY must only be used via ${MINT_SCRIPT} (never inline in a workflow).`,
    );
  }

  // Multiline ::add-mask:: anti-pattern: echo/printf of a whole variable.
  // Safe pattern is line-by-line from a file (while read).
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // echo "::add-mask::$FOO" or echo "::add-mask::${FOO}"
    const m =
      trimmed.match(/^echo\s+[\"']::add-mask::\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?[\"']\s*$/) ||
      trimmed.match(/^printf\s+[\"']::add-mask::%s\\n[\"']\s+[\"']?\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?[\"']?\s*$/);
    if (!m) return;
    const varName = m[1];
    // Single-line secrets (tokens, emails) are OK to mask in one shot.
    // Names that commonly hold PEMs / multiline blobs must be line-masked from a file.
    if (/(PRIVATE_KEY|PRIVATEKEY|PEM|CERT|CERTIFICATE)$/i.test(varName) || /^KEY_PEM$/i.test(varName)) {
      addError(
        file,
        i + 1,
        `Unsafe multiline mask: echo/printf "::add-mask::$${varName}" dumps PEM body lines to the log. Mask line-by-line from a file (see ${MINT_SCRIPT}).`,
      );
    }
  });

  // mask_multiline that masks "$value" in one echo — the exact bug from run 31274165861.
  if (/echo\s+[\"']::add-mask::\$value[\"']/.test(text) || /echo\s+[\"']::add-mask::\$\{value\}[\"']/.test(text)) {
    const lineNo = lines.findIndex((l) => /echo\s+[\"']::add-mask::\$\{?value\}?[\"']/.test(l)) + 1;
    addError(
      file,
      lineNo || 1,
      'Unsafe multiline mask helper (`echo "::add-mask::$value"`). Use line-by-line masking only.',
    );
  }
}

if (errors.length) {
  console.error("Actions secret-safety check failed:\n");
  for (const e of errors) console.error(`  - ${e}`);
  console.error("\nSee docs/runbooks/rotate-secrets.md and scripts/mint-github-app-token.sh.");
  process.exit(1);
}

console.log(`Actions secret-safety check passed (${files.length} workflow file(s)).`);
