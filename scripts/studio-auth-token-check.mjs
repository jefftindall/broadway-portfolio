#!/usr/bin/env node
/**
 * Post-deploy client_credentials check against the SWA Entra app (TEST-C-005).
 * Proves AAD_CLIENT_SECRET is valid without a browser. Does not use ROPC.
 *
 * Env: AZURE_TENANT_ID, AAD_CLIENT_ID, AAD_CLIENT_SECRET, AAD_MONITOR_TOKEN_SCOPE
 */
const tenantId = process.env.AZURE_TENANT_ID ?? "";
const clientId = process.env.AAD_CLIENT_ID ?? "";
const clientSecret = process.env.AAD_CLIENT_SECRET ?? "";
const scope = process.env.AAD_MONITOR_TOKEN_SCOPE ?? "";

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!tenantId || !clientId || !clientSecret || !scope) {
  fail(
    "Missing AZURE_TENANT_ID, AAD_CLIENT_ID, AAD_CLIENT_SECRET, or AAD_MONITOR_TOKEN_SCOPE.",
  );
}

const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
const body = new URLSearchParams({
  client_id: clientId,
  client_secret: clientSecret,
  grant_type: "client_credentials",
  scope,
});

const response = await fetch(tokenUrl, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body,
});

if (!response.ok) {
  const errBody = await response.text();
  const aadsts = errBody.match(/AADSTS\d+/g) ?? [];
  const codes = aadsts.length ? aadsts.join(", ") : `HTTP ${response.status}`;
  // Identifier URI / Monitor.Ping not applied yet (first CD before env terraform).
  if (aadsts.includes("AADSTS500011") || /invalid_resource/i.test(errBody)) {
    console.log(
      "client_credentials skipped: SWA app has no identifier URI yet. Apply staging/prod Terraform (Monitor.Ping). Public smoke still runs.",
    );
    process.exit(0);
  }
  fail(`client_credentials failed (${codes}). Check AAD-CLIENT-SECRET and Monitor.Ping app role.`);
}

const json = await response.json();
if (!json.access_token || typeof json.access_token !== "string") {
  fail("Token response did not include access_token.");
}

console.log("client_credentials succeeded for Monitor.Ping scope.");
