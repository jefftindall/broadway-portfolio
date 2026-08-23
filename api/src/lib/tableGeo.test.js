import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GeoRedundantTableClient,
  isDevelopmentStorage,
  isPrimaryRegionUnavailable,
  parseStorageConnectionString,
  secondaryTableServiceUrl,
} from './tableGeo.js';

const SAMPLE =
  'DefaultEndpointsProtocol=https;AccountName=stelysecrmstaging;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net';

function failingPrimary(statusCode, message = 'unavailable') {
  const err = Object.assign(new Error(message), { statusCode });
  return {
    calls: { getEntity: 0, createEntity: 0, listEntities: 0 },
    async getEntity() {
      this.calls.getEntity += 1;
      throw err;
    },
    async createEntity() {
      this.calls.createEntity += 1;
      throw err;
    },
    listEntities() {
      this.calls.listEntities += 1;
      return {
        async *[Symbol.asyncIterator]() {
          throw err;
        },
      };
    },
  };
}

test('secondaryTableServiceUrl uses the RA-GRS -secondary host', () => {
  assert.equal(
    secondaryTableServiceUrl(SAMPLE),
    'https://stelysecrmstaging-secondary.table.core.windows.net',
  );
  assert.equal(
    secondaryTableServiceUrl(
      'TableEndpoint=https://stelysecrmprod.table.core.windows.net/;AccountName=stelysecrmprod;AccountKey=dGVzdA==',
    ),
    'https://stelysecrmprod-secondary.table.core.windows.net',
  );
  assert.equal(secondaryTableServiceUrl('UseDevelopmentStorage=true'), '');
  assert.equal(isDevelopmentStorage('UseDevelopmentStorage=true'), true);
  assert.equal(parseStorageConnectionString(SAMPLE).AccountName, 'stelysecrmstaging');
});

test('isPrimaryRegionUnavailable ignores app errors and matches outages', () => {
  assert.equal(isPrimaryRegionUnavailable({ statusCode: 404 }), false);
  assert.equal(isPrimaryRegionUnavailable({ statusCode: 409 }), false);
  assert.equal(isPrimaryRegionUnavailable({ statusCode: 412 }), false);
  assert.equal(isPrimaryRegionUnavailable({ statusCode: 503 }), true);
  assert.equal(isPrimaryRegionUnavailable({ code: 'ETIMEDOUT' }), true);
  assert.equal(isPrimaryRegionUnavailable({ message: 'The server is busy' }), true);
});

test('reads fall back to secondary when the primary region is down', async () => {
  const primary = failingPrimary(503, 'The server is busy');
  const secondary = {
    async getEntity(pk, rk) {
      return { partitionKey: pk, rowKey: rk, from: 'secondary' };
    },
    listEntities() {
      return {
        async *[Symbol.asyncIterator]() {
          yield { rowKey: 'a', from: 'secondary' };
        },
      };
    },
  };
  const client = new GeoRedundantTableClient(primary, secondary);
  const entity = await client.getEntity('owner', 'id-1');
  assert.equal(entity.from, 'secondary');
  assert.equal(primary.calls.getEntity, 1);

  const listed = [];
  for await (const row of client.listEntities()) {
    listed.push(row);
  }
  assert.deepEqual(listed, [{ rowKey: 'a', from: 'secondary' }]);
});

test('reads do not use secondary for not-found or conflicts', async () => {
  const primary = failingPrimary(404, 'NotFound');
  let secondaryGets = 0;
  const client = new GeoRedundantTableClient(primary, {
    async getEntity() {
      secondaryGets += 1;
      return { from: 'secondary' };
    },
  });
  await assert.rejects(() => client.getEntity('owner', 'missing'), { statusCode: 404 });
  assert.equal(secondaryGets, 0);
});

test('writes stay on the primary even when it is down', async () => {
  const primary = failingPrimary(503, 'The server is busy');
  let secondaryWrites = 0;
  const client = new GeoRedundantTableClient(primary, {
    async createEntity() {
      secondaryWrites += 1;
    },
  });
  await assert.rejects(() => client.createEntity({ rowKey: 'x' }), { statusCode: 503 });
  assert.equal(primary.calls.createEntity, 1);
  assert.equal(secondaryWrites, 0);
});
