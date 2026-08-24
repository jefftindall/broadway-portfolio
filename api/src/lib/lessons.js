/**
 * Studio lesson workflow store — Table Storage schema and validation.
 * Google Calendar owns time when connected; this table owns requested/confirmed
 * /declined/cancelled. Never log student emails, names, or tokens.
 */
import { randomUUID } from 'node:crypto';
import { isUsableConnectionString } from './contacts.js';
import { createGeoRedundantTableClient } from './tableGeo.js';

export const STUDIO_LESSONS_PARTITION = 'lessons';
export const LESSON_STATUSES = ['requested', 'confirmed', 'declined', 'cancelled'];
export const LESSON_FORMATS = ['nyc', 'zoom'];
export const LESSON_DURATIONS = [30, 60];
export const DEFAULT_LESSON_TIMEZONE = 'America/New_York';
/** Quarterly weekly series — STUDIO-P3-004. */
export const MAX_RECURRING_INSTANCES = 12;
export const DEFAULT_RECURRING_INSTANCES = 12;

export class LessonValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LessonValidationError';
  }
}

export class LessonNotFoundError extends Error {
  constructor(message = 'not found') {
    super(message);
    this.name = 'LessonNotFoundError';
  }
}

export class LessonConflictError extends Error {
  constructor(message = 'conflict') {
    super(message);
    this.name = 'LessonConflictError';
  }
}

export class LessonConfigError extends Error {
  constructor(message = 'missing studio_lessons_storage') {
    super(message);
    this.name = 'LessonConfigError';
  }
}

function trimTo(value, max) {
  return String(value || '').trim().slice(0, max);
}

function asIsoDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const text = String(value).trim();
  if (!text) return '';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

/**
 * Convert a wall-clock local datetime (YYYY-MM-DDTHH:mm) in `timeZone` to UTC ISO.
 */
export function localWallTimeToIso(local, timeZone = DEFAULT_LESSON_TIMEZONE) {
  const text = String(local || '').trim();
  if (!text) {
    throw new LessonValidationError('Start time is required.');
  }
  if (/Z$|[+-]\d{2}:\d{2}$/.test(text)) {
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      throw new LessonValidationError('Start time is not a valid date.');
    }
    return parsed.toISOString();
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(text);
  if (!match) {
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      throw new LessonValidationError('Start time is not a valid date.');
    }
    return parsed.toISOString();
  }
  const wall = `${match[1]}T${match[2]}:${match[3] || '00'}`;
  const asUtc = new Date(`${wall}Z`);
  if (Number.isNaN(asUtc.getTime())) {
    throw new LessonValidationError('Start time is not a valid date.');
  }
  const offsetMs = timeZoneOffsetMs(asUtc, timeZone);
  return new Date(asUtc.getTime() - offsetMs).toISOString();
}

function timeZoneOffsetMs(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUtc - date.getTime();
}

export function addWeeksToWall(local, weeks) {
  const text = String(local || '').trim();
  const match = /^(\d{4}-\d{2}-\d{2})T(.+)$/.exec(text);
  if (!match) {
    throw new LessonValidationError('Start time is not a valid date.');
  }
  const date = new Date(`${match[1]}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(weeks) * 7);
  return `${date.toISOString().slice(0, 10)}T${match[2]}`;
}

export function addMinutesIso(iso, minutes) {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) {
    throw new LessonValidationError('Start time is not a valid date.');
  }
  return new Date(start.getTime() + Number(minutes) * 60_000).toISOString();
}

export function normalizeRecurringCount(value) {
  if (value === '' || value === null || value === undefined) {
    return DEFAULT_RECURRING_INSTANCES;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new LessonValidationError('Weekly series must request at least 1 lesson.');
  }
  if (n > MAX_RECURRING_INSTANCES) {
    throw new LessonValidationError(
      `Weekly series is limited to ${MAX_RECURRING_INSTANCES} lessons (one quarter).`,
    );
  }
  return n;
}

export function normalizeLessonInput(input = {}, { partial = false } = {}) {
  const contactId = trimTo(input.contactId, 80);
  const timezone = trimTo(input.timezone, 80) || DEFAULT_LESSON_TIMEZONE;
  const format = String(input.format || '')
    .trim()
    .toLowerCase();
  const durationMin = Number(input.durationMin);
  const status = String(input.status || 'requested')
    .trim()
    .toLowerCase();

  if (!partial && !contactId) {
    throw new LessonValidationError('A student is required.');
  }
  if (!partial) {
    if (!LESSON_FORMATS.includes(format)) {
      throw new LessonValidationError('Format must be NYC or Zoom.');
    }
    if (!LESSON_DURATIONS.includes(durationMin)) {
      throw new LessonValidationError('Lesson length must be 30 or 60 minutes.');
    }
  } else {
    if (format && !LESSON_FORMATS.includes(format)) {
      throw new LessonValidationError('Format must be NYC or Zoom.');
    }
    if (input.durationMin !== undefined && input.durationMin !== '' && !LESSON_DURATIONS.includes(durationMin)) {
      throw new LessonValidationError('Lesson length must be 30 or 60 minutes.');
    }
  }
  if (status && !LESSON_STATUSES.includes(status)) {
    throw new LessonValidationError('Unknown lesson status.');
  }

  let startAt = '';
  if (input.startAt) {
    startAt = /Z$|[+-]\d{2}:\d{2}$/.test(String(input.startAt))
      ? asIsoDate(input.startAt)
      : localWallTimeToIso(input.startAt, timezone);
    if (!startAt) throw new LessonValidationError('Start time is not a valid date.');
  } else if (!partial) {
    throw new LessonValidationError('Start time is required.');
  }

  const resolvedDuration = LESSON_DURATIONS.includes(durationMin) ? durationMin : 60;
  const endAt = startAt ? addMinutesIso(startAt, resolvedDuration) : '';

  return {
    ...(contactId ? { contactId } : {}),
    ...(format ? { format } : {}),
    ...(LESSON_DURATIONS.includes(durationMin) ? { durationMin } : {}),
    ...(startAt ? { startAt, endAt } : {}),
    timezone,
    ...(status ? { status } : {}),
  };
}

function entityToLesson(entity) {
  return {
    id: entity.rowKey,
    contactId: entity.contactId || '',
    status: entity.status || 'requested',
    startAt: entity.startAt || '',
    endAt: entity.endAt || '',
    durationMin: Number(entity.durationMin) || 60,
    format: entity.format || 'zoom',
    timezone: entity.timezone || DEFAULT_LESSON_TIMEZONE,
    seriesId: entity.seriesId || '',
    occurrenceIndex: entity.occurrenceIndex === '' || entity.occurrenceIndex === undefined
      ? null
      : Number(entity.occurrenceIndex),
    googleEventId: entity.googleEventId || '',
    googleCalendarId: entity.googleCalendarId || '',
    googleInstanceId: entity.googleInstanceId || '',
    calendarFallback: entity.calendarFallback || '',
    createdAt: entity.createdAt || '',
    updatedAt: entity.updatedAt || '',
    confirmedAt: entity.confirmedAt || '',
    declinedAt: entity.declinedAt || '',
    cancelledAt: entity.cancelledAt || '',
    requestedEmailSentAt: entity.requestedEmailSentAt || '',
    confirmedEmailSentAt: entity.confirmedEmailSentAt || '',
    reminderSentOn: entity.reminderSentOn || '',
    etag: entity.etag || '',
  };
}

export function publicLesson(lesson) {
  if (!lesson) return lesson;
  return { ...lesson };
}

function storageError(err) {
  const status = err?.statusCode || err?.status || 0;
  if (status === 404) return new LessonNotFoundError();
  if (status === 409 || status === 412) return new LessonConflictError();
  return err;
}

export function createLessonsStore({ tableClient }) {
  if (!tableClient) {
    throw new LessonConfigError('missing studio_lessons_storage');
  }

  async function getRecord(id) {
    const rowKey = String(id || '').trim();
    if (!rowKey) throw new LessonNotFoundError();
    try {
      const entity = await tableClient.getEntity(STUDIO_LESSONS_PARTITION, rowKey);
      return entityToLesson(entity);
    } catch (err) {
      throw storageError(err);
    }
  }

  async function listPartition() {
    const rows = [];
    const iter = tableClient.listEntities({
      queryOptions: { filter: `PartitionKey eq '${STUDIO_LESSONS_PARTITION}'` },
    });
    for await (const entity of iter) {
      rows.push(entityToLesson(entity));
    }
    return rows;
  }

  return {
    async list({ from, to, contactId, status, seriesId, includeCancelled = true } = {}) {
      const fromMs = from ? Date.parse(from) : NaN;
      const toMs = to ? Date.parse(to) : NaN;
      const wantedContact = String(contactId || '').trim();
      const wantedStatus = String(status || '')
        .trim()
        .toLowerCase();
      const wantedSeries = String(seriesId || '').trim();
      const rows = (await listPartition())
        .filter((row) => includeCancelled || row.status !== 'cancelled')
        .filter((row) => !wantedContact || row.contactId === wantedContact)
        .filter((row) => !wantedStatus || row.status === wantedStatus)
        .filter((row) => !wantedSeries || row.seriesId === wantedSeries)
        .filter((row) => {
          if (!row.startAt) return true;
          const ms = Date.parse(row.startAt);
          if (Number.isFinite(fromMs) && ms < fromMs) return false;
          if (Number.isFinite(toMs) && ms > toMs) return false;
          return true;
        })
        .sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
      return { lessons: rows.map(publicLesson), total: rows.length };
    },

    async get(id) {
      return publicLesson(await getRecord(id));
    },

    async create(input) {
      const fields = normalizeLessonInput(input, { partial: false });
      const now = new Date().toISOString();
      const id = trimTo(input.id, 80) || randomUUID();
      const record = {
        partitionKey: STUDIO_LESSONS_PARTITION,
        rowKey: id,
        contactId: fields.contactId,
        status: 'requested',
        startAt: fields.startAt,
        endAt: fields.endAt,
        durationMin: fields.durationMin,
        format: fields.format,
        timezone: fields.timezone,
        seriesId: trimTo(input.seriesId, 80),
        occurrenceIndex:
          input.occurrenceIndex === undefined || input.occurrenceIndex === null
            ? ''
            : String(input.occurrenceIndex),
        googleEventId: '',
        googleCalendarId: '',
        googleInstanceId: '',
        calendarFallback: '',
        createdAt: now,
        updatedAt: now,
        confirmedAt: '',
        declinedAt: '',
        cancelledAt: '',
        requestedEmailSentAt: '',
        confirmedEmailSentAt: '',
        reminderSentOn: '',
      };
      try {
        await tableClient.createEntity(record);
      } catch (err) {
        throw storageError(err);
      }
      return publicLesson(entityToLesson(record));
    },

    async update(id, patch, { etag } = {}) {
      const current = await getRecord(id);
      const fields = normalizeLessonInput({ ...current, ...patch }, { partial: true });
      const now = new Date().toISOString();
      const nextStatus = fields.status || current.status;
      const record = {
        partitionKey: STUDIO_LESSONS_PARTITION,
        rowKey: current.id,
        contactId: fields.contactId || current.contactId,
        status: nextStatus,
        startAt: fields.startAt || current.startAt,
        endAt: fields.endAt || current.endAt,
        durationMin: fields.durationMin || current.durationMin,
        format: fields.format || current.format,
        timezone: fields.timezone || current.timezone,
        seriesId: patch.seriesId !== undefined ? trimTo(patch.seriesId, 80) : current.seriesId,
        occurrenceIndex:
          patch.occurrenceIndex !== undefined
            ? String(patch.occurrenceIndex ?? '')
            : current.occurrenceIndex === null
              ? ''
              : String(current.occurrenceIndex),
        googleEventId:
          patch.googleEventId !== undefined ? trimTo(patch.googleEventId, 200) : current.googleEventId,
        googleCalendarId:
          patch.googleCalendarId !== undefined
            ? trimTo(patch.googleCalendarId, 200)
            : current.googleCalendarId,
        googleInstanceId:
          patch.googleInstanceId !== undefined
            ? trimTo(patch.googleInstanceId, 200)
            : current.googleInstanceId,
        calendarFallback:
          patch.calendarFallback !== undefined
            ? trimTo(patch.calendarFallback, 40)
            : current.calendarFallback,
        createdAt: current.createdAt,
        updatedAt: now,
        confirmedAt: nextStatus === 'confirmed' ? current.confirmedAt || now : current.confirmedAt,
        declinedAt: nextStatus === 'declined' ? current.declinedAt || now : current.declinedAt,
        cancelledAt: nextStatus === 'cancelled' ? current.cancelledAt || now : current.cancelledAt,
        requestedEmailSentAt:
          patch.requestedEmailSentAt !== undefined
            ? asIsoDate(patch.requestedEmailSentAt) || ''
            : current.requestedEmailSentAt,
        confirmedEmailSentAt:
          patch.confirmedEmailSentAt !== undefined
            ? asIsoDate(patch.confirmedEmailSentAt) || ''
            : current.confirmedEmailSentAt,
        reminderSentOn:
          patch.reminderSentOn !== undefined ? trimTo(patch.reminderSentOn, 20) : current.reminderSentOn,
        etag: etag || current.etag,
      };
      try {
        await tableClient.updateEntity(record, 'Replace');
      } catch (err) {
        throw storageError(err);
      }
      return publicLesson(entityToLesson(record));
    },

    async listByGoogleEventId(eventId) {
      const id = String(eventId || '').trim();
      if (!id) return [];
      const rows = await listPartition();
      return rows.filter((row) => row.googleEventId === id || row.googleInstanceId === id);
    },
  };
}

export function lessonsStoreFromEnv(env = process.env) {
  const connectionString = env.STUDIO_CRM_STORAGE_CONNECTION_STRING;
  const tableName = String(env.STUDIO_LESSONS_TABLE_NAME || 'studioLessons').trim() || 'studioLessons';
  if (!isUsableConnectionString(connectionString)) {
    throw new LessonConfigError('missing studio_lessons_storage');
  }
  return createLessonsStore({
    tableClient: createGeoRedundantTableClient(connectionString, tableName),
  });
}

export function tryLessonsStoreFromEnv(env = process.env) {
  try {
    return lessonsStoreFromEnv(env);
  } catch (err) {
    if (err instanceof LessonConfigError) return null;
    throw err;
  }
}
