/**
 * Contact-account lesson history + parent book targets (ACCOUNT-P4-*).
 */
import { CrmNotFoundError } from './contacts.js';

export class ContactBookTargetError extends Error {
  constructor(message) {
    super(message || 'That student is not linked to your account.');
    this.name = 'ContactBookTargetError';
  }
}

export function hasParentPersona(contact) {
  return (contact?.personas || []).includes('parent');
}

export function linkedStudentIds(contact) {
  return (contact?.relatedContacts || [])
    .filter((rel) => rel.relation === 'student' && rel.id)
    .map((rel) => String(rel.id));
}

export function accountLessonContactIds(contact) {
  const ids = new Set([contact.id]);
  if (hasParentPersona(contact)) {
    for (const id of linkedStudentIds(contact)) ids.add(id);
  }
  return [...ids];
}

export function accountLessonStatusLabel(status) {
  switch (String(status || '').trim().toLowerCase()) {
    case 'confirmed':
      return 'Confirmed';
    case 'declined':
      return 'Declined';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Requested';
  }
}

/**
 * @param {object} lesson
 * @param {{ studentName?: string }} [opts]
 */
export function publicAccountLesson(lesson, opts = {}) {
  if (!lesson) return null;
  const row = {
    id: lesson.id,
    startAt: lesson.startAt,
    endAt: lesson.endAt,
    durationMin: lesson.durationMin,
    format: lesson.format,
    timezone: lesson.timezone,
    status: lesson.status,
    statusLabel: accountLessonStatusLabel(lesson.status),
  };
  if (opts.studentName) {
    row.studentName = opts.studentName;
  }
  return row;
}

export async function loadBookableStudents(contactsStore, contact) {
  if (!hasParentPersona(contact)) return [];
  const students = [];
  for (const id of linkedStudentIds(contact)) {
    try {
      const row = await contactsStore.get(id);
      if (row && !row.archived) {
        students.push({ id: row.id, displayName: row.displayName });
      }
    } catch {
      // Skip missing links — operator may still be wiring People.
    }
  }
  return students.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
}

/**
 * Resolve the lesson contact row for a book request. Body `contactId` is ignored.
 */
export async function resolveBookTargetContact({ booker, body, contactsStore }) {
  const raw = String(body?.bookForContactId || '').trim();
  if (!raw || raw === booker.id) {
    return { contact: booker, contactId: booker.id, bookedByParent: false };
  }
  if (!hasParentPersona(booker)) {
    throw new ContactBookTargetError('Only parents can book for a linked student.');
  }
  if (!linkedStudentIds(booker).includes(raw)) {
    throw new ContactBookTargetError();
  }
  const student = await contactsStore.get(raw);
  if (!student || student.archived) {
    throw new CrmNotFoundError();
  }
  return { contact: student, contactId: student.id, bookedByParent: true, booker };
}

export async function listAccountLessons({ contact, lessons, contactsStore, now = Date.now() }) {
  const allowedIds = new Set(accountLessonContactIds(contact));
  const nameById = new Map([[contact.id, contact.displayName]]);
  for (const id of linkedStudentIds(contact)) {
    try {
      const row = await contactsStore.get(id);
      if (row) nameById.set(id, row.displayName);
    } catch {
      // skip
    }
  }

  const rows = [];
  const seen = new Set();
  for (const id of allowedIds) {
    const { lessons: batch } = await lessons.list({ contactId: id, includeCancelled: true });
    for (const lesson of batch) {
      if (seen.has(lesson.id)) continue;
      seen.add(lesson.id);
      rows.push(lesson);
    }
  }

  rows.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));

  const upcoming = [];
  const past = [];
  for (const lesson of rows) {
    const studentName =
      lesson.contactId !== contact.id ? nameById.get(lesson.contactId) || undefined : undefined;
    const publicRow = publicAccountLesson(lesson, { studentName });
    const start = Date.parse(lesson.startAt);
    if (Number.isFinite(start) && start >= now) upcoming.push(publicRow);
    else past.push(publicRow);
  }
  past.reverse();

  return { upcoming, past };
}
