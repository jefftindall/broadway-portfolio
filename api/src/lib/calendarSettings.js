/**
 * Studio Calendar connection store — OAuth rows, free/busy calendar ids, watch channel.
 * Never return refresh tokens to the UI. Never log token values.
 */
import { randomUUID } from 'node:crypto';
import { isUsableConnectionString } from './contacts.js';
import { createGeoRedundantTableClient } from './tableGeo.js';

export const CALENDAR_OAUTH_PARTITION = 'oauth';
export const CALENDAR_CONFIG_PARTITION = 'config';
export const CALENDAR_WATCH_PARTITION = 'watch';
export const CALENDAR_ROLES = ['organizer', 'elyse'];
export const DEFAULT_BUFFER_MINUTES = 15;
export const DEFAULT_MIN_NOTICE_HOURS = 12;
export const DEFAULT_AVAILABILITY_TIMEZONE = 'America/New_York';

export class CalendarConfigError extends Error {
  constructor(message = 'missing studio_calendar_storage') {
    super(message);
    this.name = 'CalendarConfigError';
  }
}

export class CalendarValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CalendarValidationError';
  }
}

function usableSecret(value) {
  const trimmed = String(value || '').trim();
  return Boolean(trimmed) && trimmed !== 'REPLACE_ME';
}

function parseJsonArray(raw, fallback = []) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function envRefreshToken(env, role) {
  const name =
    role === 'elyse'
      ? 'GOOGLE_CALENDAR_ELYSE_REFRESH_TOKEN'
      : 'GOOGLE_CALENDAR_ORGANIZER_REFRESH_TOKEN';
  return usableSecret(env[name]) ? String(env[name]).trim() : '';
}

function storageError(err) {
  const status = err?.statusCode || err?.status || 0;
  if (status === 404) return null;
  return err;
}

export function createCalendarSettingsStore({ tableClient, env = process.env }) {
  if (!tableClient) {
    throw new CalendarConfigError('missing studio_calendar_storage');
  }

  async function getEntity(partitionKey, rowKey) {
    try {
      return await tableClient.getEntity(partitionKey, rowKey);
    } catch (err) {
      if (storageError(err) === null) return null;
      throw err;
    }
  }

  async function upsert(partitionKey, rowKey, fields) {
    const existing = await getEntity(partitionKey, rowKey);
    const now = new Date().toISOString();
    const record = {
      partitionKey,
      rowKey,
      ...(existing || {}),
      ...fields,
      updatedAt: now,
      createdAt: existing?.createdAt || now,
    };
    if (existing) {
      await tableClient.updateEntity(record, 'Replace');
    } else {
      await tableClient.createEntity(record);
    }
    return record;
  }

  return {
    async getConnection(role) {
      if (!CALENDAR_ROLES.includes(role)) {
        throw new CalendarValidationError('Unknown Calendar role.');
      }
      const row = await getEntity(CALENDAR_OAUTH_PARTITION, role);
      if (row) {
        const connected = row.status === 'connected' && usableSecret(row.refreshToken);
        return {
          role,
          connected,
          email: connected ? String(row.googleEmail || '') : '',
          refreshToken: connected ? String(row.refreshToken || '') : '',
          source: 'table',
          connectedAt: row.connectedAt || '',
        };
      }
      const fallback = envRefreshToken(env, role);
      return {
        role,
        connected: Boolean(fallback),
        email: '',
        refreshToken: fallback,
        source: fallback ? 'env' : 'none',
        connectedAt: '',
      };
    },

    async saveConnection(role, { refreshToken, googleEmail }) {
      if (!CALENDAR_ROLES.includes(role)) {
        throw new CalendarValidationError('Unknown Calendar role.');
      }
      if (!usableSecret(refreshToken)) {
        throw new CalendarValidationError('Google did not return a reusable sign-in.');
      }
      await upsert(CALENDAR_OAUTH_PARTITION, role, {
        status: 'connected',
        refreshToken: String(refreshToken).trim(),
        googleEmail: String(googleEmail || '').trim(),
        connectedAt: new Date().toISOString(),
      });
    },

    async disconnect(role) {
      if (!CALENDAR_ROLES.includes(role)) {
        throw new CalendarValidationError('Unknown Calendar role.');
      }
      await upsert(CALENDAR_OAUTH_PARTITION, role, {
        status: 'disconnected',
        refreshToken: '',
        googleEmail: '',
        connectedAt: '',
      });
    },

    async getAvailability() {
      const row = await getEntity(CALENDAR_CONFIG_PARTITION, 'availability');
      const calendarIds = parseJsonArray(row?.calendarIdsJson, []);
      return {
        timezone: row?.timezone || DEFAULT_AVAILABILITY_TIMEZONE,
        bufferMinutes: Number(row?.bufferMinutes) || DEFAULT_BUFFER_MINUTES,
        minNoticeHours: Number(row?.minNoticeHours) || DEFAULT_MIN_NOTICE_HOURS,
        durationMinutes: [30, 60],
        calendarIds,
      };
    },

    async saveAvailability(patch = {}) {
      const current = await this.getAvailability();
      const bufferMinutes =
        patch.bufferMinutes === undefined ? current.bufferMinutes : Number(patch.bufferMinutes);
      const minNoticeHours =
        patch.minNoticeHours === undefined ? current.minNoticeHours : Number(patch.minNoticeHours);
      if (!Number.isFinite(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 120) {
        throw new CalendarValidationError('Buffer must be between 0 and 120 minutes.');
      }
      if (!Number.isFinite(minNoticeHours) || minNoticeHours < 0 || minNoticeHours > 168) {
        throw new CalendarValidationError('Minimum notice must be between 0 and 168 hours.');
      }
      const calendarIds = Array.isArray(patch.calendarIds)
        ? patch.calendarIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 20)
        : current.calendarIds;
      await upsert(CALENDAR_CONFIG_PARTITION, 'availability', {
        timezone: String(patch.timezone || current.timezone || DEFAULT_AVAILABILITY_TIMEZONE).trim(),
        bufferMinutes,
        minNoticeHours,
        calendarIdsJson: JSON.stringify(calendarIds),
      });
      return this.getAvailability();
    },

    async getWatch() {
      const row = await getEntity(CALENDAR_WATCH_PARTITION, 'events');
      if (!row) return { channelId: '', resourceId: '', token: '', expiration: '' };
      return {
        channelId: row.channelId || '',
        resourceId: row.resourceId || '',
        token: row.token || '',
        expiration: row.expiration || '',
      };
    },

    async saveWatch({ channelId, resourceId, token, expiration }) {
      await upsert(CALENDAR_WATCH_PARTITION, 'events', {
        channelId: String(channelId || '').trim(),
        resourceId: String(resourceId || '').trim(),
        token: String(token || randomUUID()).trim(),
        expiration: String(expiration || '').trim(),
      });
      return this.getWatch();
    },

    publicStatus(organizer, elyse, availability, watch) {
      return {
        organizer: {
          connected: Boolean(organizer?.connected),
          email: organizer?.connected ? organizer.email || '' : '',
        },
        elyse: {
          connected: Boolean(elyse?.connected),
          email: elyse?.connected ? elyse.email || '' : '',
        },
        availability,
        watch: {
          active: Boolean(watch?.channelId && watch?.expiration),
          expiration: watch?.expiration || '',
        },
      };
    },
  };
}

export function calendarSettingsStoreFromEnv(env = process.env) {
  const connectionString = env.STUDIO_CRM_STORAGE_CONNECTION_STRING;
  const tableName =
    String(env.STUDIO_CALENDAR_TABLE_NAME || 'studioCalendar').trim() || 'studioCalendar';
  if (!isUsableConnectionString(connectionString)) {
    throw new CalendarConfigError('missing studio_calendar_storage');
  }
  return createCalendarSettingsStore({
    tableClient: createGeoRedundantTableClient(connectionString, tableName),
    env,
  });
}

export function tryCalendarSettingsStoreFromEnv(env = process.env) {
  try {
    return calendarSettingsStoreFromEnv(env);
  } catch (err) {
    if (err instanceof CalendarConfigError) return null;
    throw err;
  }
}

export function calendarClientConfigured(env = process.env) {
  return usableSecret(env.GOOGLE_CALENDAR_CLIENT_ID) && usableSecret(env.GOOGLE_CALENDAR_CLIENT_SECRET);
}
