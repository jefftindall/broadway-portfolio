/**
 * RA-GRS Table Storage helpers. Reads fall back to the paired-region secondary
 * when the primary is unreachable. Writes stay on the primary (secondary is
 * read-only until an account failover). Never log connection strings or keys.
 */
import { AzureNamedKeyCredential, TableClient } from '@azure/data-tables';

const NON_FAILOVER_STATUS = new Set([400, 401, 403, 404, 409, 412]);

export function parseStorageConnectionString(connectionString) {
  const trimmed = String(connectionString || '').trim();
  const parts = {};
  for (const segment of trimmed.split(';')) {
    if (!segment) continue;
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    parts[segment.slice(0, eq)] = segment.slice(eq + 1);
  }
  return parts;
}

export function isDevelopmentStorage(connectionString) {
  const parts = parseStorageConnectionString(connectionString);
  if (String(parts.UseDevelopmentStorage || '').toLowerCase() === 'true') return true;
  return /127\.0\.0\.1|localhost/i.test(parts.TableEndpoint || '');
}

export function secondaryTableServiceUrl(connectionString) {
  if (isDevelopmentStorage(connectionString)) return '';
  const parts = parseStorageConnectionString(connectionString);
  const tableEndpoint = String(parts.TableEndpoint || '').replace(/\/+$/, '');
  if (tableEndpoint) {
    const swapped = tableEndpoint.replace(
      /^(https?:\/\/)([^.]+)\.table\./i,
      (match, proto, account) =>
        account.endsWith('-secondary') ? match : `${proto}${account}-secondary.table.`,
    );
    return swapped !== tableEndpoint ? swapped : '';
  }
  const account = String(parts.AccountName || '').trim();
  if (!account) return '';
  const suffix = String(parts.EndpointSuffix || 'core.windows.net').trim() || 'core.windows.net';
  return `https://${account}-secondary.table.${suffix}`;
}

export function isPrimaryRegionUnavailable(err) {
  if (!err) return false;
  const status = err.statusCode ?? err.status;
  if (NON_FAILOVER_STATUS.has(status)) return false;
  if (status === 500 || status === 502 || status === 503 || status === 504) return true;
  const code = String(err.code || err.details?.errorCode || '');
  if (
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|UND_ERR/i.test(
      code,
    )
  ) {
    return true;
  }
  const message = String(err.message || '');
  return /timeout|ECONNRESET|ECONNREFUSED|ENOTFOUND|temporarily unavailable|server is busy|ServerBusy/i.test(
    message,
  );
}

export class GeoRedundantTableClient {
  constructor(primary, secondary) {
    this.primary = primary;
    this.secondary = secondary || null;
  }

  async #read(method, args) {
    try {
      return await this.primary[method](...args);
    } catch (err) {
      if (!this.secondary || !isPrimaryRegionUnavailable(err)) throw err;
      return await this.secondary[method](...args);
    }
  }

  getEntity(...args) {
    return this.#read('getEntity', args);
  }

  createEntity(...args) {
    return this.primary.createEntity(...args);
  }

  updateEntity(...args) {
    return this.primary.updateEntity(...args);
  }

  deleteEntity(...args) {
    return this.primary.deleteEntity(...args);
  }

  listEntities(options) {
    const primary = this.primary;
    const secondary = this.secondary;
    return {
      async *[Symbol.asyncIterator]() {
        try {
          const buffered = [];
          for await (const entity of primary.listEntities(options)) {
            buffered.push(entity);
          }
          yield* buffered;
        } catch (err) {
          if (!secondary || !isPrimaryRegionUnavailable(err)) throw err;
          for await (const entity of secondary.listEntities(options)) {
            yield entity;
          }
        }
      },
    };
  }
}

export function createGeoRedundantTableClient(connectionString, tableName) {
  const primary = TableClient.fromConnectionString(connectionString, tableName);
  const secondaryUrl = secondaryTableServiceUrl(connectionString);
  const parts = parseStorageConnectionString(connectionString);
  if (!secondaryUrl || !parts.AccountName || !parts.AccountKey) {
    return primary;
  }
  const secondary = new TableClient(
    secondaryUrl,
    tableName,
    new AzureNamedKeyCredential(parts.AccountName, parts.AccountKey),
  );
  return new GeoRedundantTableClient(primary, secondary);
}
