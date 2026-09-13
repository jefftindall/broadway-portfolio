/**
 * First-login link rules (ACCOUNT-P2-001).
 * Logs contact ids + kinds only — never emails or tokens.
 */
import { CrmNotFoundError, normalizeEmail, normalizeContactInput } from './contacts.js';
import { ContactIdentityConflictError } from './contactIdentities.js';
import {
  contactDisplayNameFromPrincipal,
  contactEmailFromPrincipal,
  contactIdentityKeyFromPrincipal,
} from './contactPrincipal.js';

export class ContactLinkError extends Error {
  constructor(message, { status = 403 } = {}) {
    super(message);
    this.name = 'ContactLinkError';
    this.status = status;
  }
}

export class ContactArchivedError extends Error {
  constructor(message = 'account archived') {
    super(message);
    this.name = 'ContactArchivedError';
  }
}

async function findEmailMatchForLink(contactsStore, email) {
  const key = normalizeEmail(email);
  if (!key) return { active: null, hasArchived: false, ambiguousActive: false };
  const listed = await contactsStore.list({ includeArchived: true, directory: true });
  const matches = (listed.contacts || []).filter((row) => normalizeEmail(row.email) === key);
  const active = matches.filter((row) => !row.archived);
  const archived = matches.filter((row) => row.archived);
  if (active.length > 1) {
    return { active: null, hasArchived: archived.length > 0, ambiguousActive: true };
  }
  if (active.length === 1) {
    return { active: active[0], hasArchived: archived.length > 0, ambiguousActive: false };
  }
  return { active: null, hasArchived: archived.length > 0, ambiguousActive: false };
}

/**
 * Resolve or create the People row for a signed-in contact principal.
 * @param {{ contactsStore: object, identitiesStore: object, principal: object, defaultPersona?: string }} input
 */
export async function ensureLinkedContact({
  contactsStore,
  identitiesStore,
  principal,
  defaultPersona = 'student',
}) {
  const identityKey = contactIdentityKeyFromPrincipal(principal);
  if (!identityKey.provider || !identityKey.subject) {
    throw new ContactLinkError('Sign in to manage your account.', { status: 401 });
  }

  const existingIdentity = await identitiesStore.findByKey(identityKey);
  if (existingIdentity?.contactId) {
    let contact;
    try {
      contact = await contactsStore.get(existingIdentity.contactId);
    } catch (err) {
      if (err instanceof CrmNotFoundError) {
        throw new ContactLinkError('Your account needs to be linked again.', { status: 403 });
      }
      throw err;
    }
    if (contact.archived) {
      throw new ContactArchivedError();
    }
    return { contact, linked: false, created: false };
  }

  const email = contactEmailFromPrincipal(principal);
  const displayName = contactDisplayNameFromPrincipal(principal);

  if (email) {
    const { active, hasArchived, ambiguousActive } = await findEmailMatchForLink(contactsStore, email);
    if (ambiguousActive) {
      throw new ContactLinkError('Your account needs a person in Studio before you can sign in.', {
        status: 403,
      });
    }
    if (!active && hasArchived) {
      throw new ContactArchivedError();
    }
    if (active) {
      try {
        await identitiesStore.attach({
          ...identityKey,
          contactId: active.id,
        });
      } catch (err) {
        if (err instanceof ContactIdentityConflictError) {
          throw new ContactLinkError('Your account needs to be linked again.', { status: 403 });
        }
        throw err;
      }
      return { contact: active, linked: true, created: false };
    }
  }

  const persona = defaultPersona === 'parent' ? 'parent' : 'student';
  const fields = normalizeContactInput(
    {
      displayName,
      email: email || '',
      personas: [persona],
    },
    { partial: false },
  );
  const contact = await contactsStore.create(fields);
  try {
    await identitiesStore.attach({
      ...identityKey,
      contactId: contact.id,
    });
  } catch (err) {
    try {
      await contactsStore.archive(contact.id, true);
    } catch {
      // Best-effort rollback.
    }
    throw err;
  }
  return { contact, linked: true, created: true };
}
