/**
 * Resolve Studio roles + discrete permissions for a signed-in principal.
 *
 * Authentication (SWA principal) is not authorization. The user-profile
 * table is the source of truth (roles + extraPermissions − deniedPermissions).
 * `ALLOWED_USER_IDS` is a one-time bootstrap: the first session for an
 * allowlisted caller without a profile writes a Super Administrator row, then later
 * checks use only that profile (publish and People share the same catalog).
 *
 * Development (`AZURE_FUNCTIONS_ENVIRONMENT=Development`) grants every
 * catalog permission so `func start` works without SWA headers.
 */
import {
  getClientPrincipal,
  identityCandidates,
  isAuthorizedPublisher,
  isDevelopmentEnvironment,
  isSignedInStudioUser,
  newCorrelationId,
  publisherIdentity,
} from './auth.js';
import {
  PERMISSION,
  ROLE,
  hasPermission as permissionInList,
  permissionCatalogList,
  resolvePermissions,
  roleCatalogList,
} from './permissions.js';
import { tryUsersStoreFromEnv } from './users.js';

function emptyAccess(principal, source) {
  return {
    signedIn: false,
    principal: principal || null,
    roles: [],
    permissions: [],
    source,
    profile: null,
  };
}

function ownerInputFromPrincipal(principal) {
  const userId = String(principal?.userId || '').trim();
  const userDetails = String(principal?.userDetails || '').trim().toLowerCase();
  const emails = identityCandidates(principal).filter((value) => value.includes('@'));
  return {
    userId,
    userDetails,
    emails,
  };
}

function accessFromProfile(principal, profile, source) {
  const disabled = profile?.status === 'disabled';
  const roles = disabled ? [] : profile.roles || [];
  const extraPermissions = disabled ? [] : profile.extraPermissions || [];
  const deniedPermissions = disabled ? [] : profile.deniedPermissions || [];
  return {
    signedIn: true,
    principal,
    roles,
    permissions: disabled
      ? []
      : resolvePermissions({ roles, extraPermissions, deniedPermissions }),
    source,
    profile,
  };
}

async function loadProfile(principal, env, usersStore) {
  const store = usersStore || tryUsersStoreFromEnv(env);
  if (!store) return null;
  try {
    return await store.findByPrincipal(principal, identityCandidates(principal));
  } catch (err) {
    if (err?.statusCode === 404 || /not found/i.test(String(err?.message || ''))) {
      return null;
    }
    throw err;
  }
}

/**
 * @param {object | null} principal
 * @param {{ env?: NodeJS.ProcessEnv, usersStore?: object }} [opts]
 */
export async function resolveStudioAccess(principal, opts = {}) {
  const env = opts.env || process.env;

  if (isDevelopmentEnvironment()) {
    const roles = [ROLE.SUPER_ADMINISTRATOR];
    const permissions = resolvePermissions({ roles });
    return {
      signedIn: true,
      principal: principal || null,
      roles,
      permissions,
      source: 'development',
      profile: null,
    };
  }

  if (!isSignedInStudioUser(principal)) {
    return emptyAccess(principal, 'anonymous');
  }

  const store = opts.usersStore || tryUsersStoreFromEnv(env);
  const profile = await loadProfile(principal, env, store);
  if (profile) {
    return accessFromProfile(
      principal,
      profile,
      profile.status === 'disabled' ? 'profile_disabled' : 'profile',
    );
  }

  if (isAuthorizedPublisher(principal) && store) {
    try {
      const migrated = await store.ensureOwnerFromAllowlist(ownerInputFromPrincipal(principal));
      if (migrated) {
        return accessFromProfile(principal, migrated, 'profile');
      }
    } catch {
      // Table missing or write failed — fall through to in-memory Super Administrator so
      // the allowlisted caller can still publish until profiles apply.
    }
  }

  if (isAuthorizedPublisher(principal)) {
    const roles = [ROLE.SUPER_ADMINISTRATOR];
    return {
      signedIn: true,
      principal,
      roles,
      permissions: resolvePermissions({ roles }),
      source: 'allowlist',
      profile: null,
    };
  }

  return {
    signedIn: true,
    principal,
    roles: [],
    permissions: [],
    source: 'authenticated',
    profile: null,
  };
}

export function hasPermission(access, permission) {
  return permissionInList(access?.permissions, permission);
}

export function accessCatalog() {
  return {
    permissions: permissionCatalogList(),
    roles: roleCatalogList(),
  };
}

/**
 * Authorize one discrete permission. Development grants every catalog ID.
 * Publish, People, and Access all use this — there is no separate allowlist gate.
 * @returns {Promise<{ allowed: boolean, signedIn: boolean, principal: object | null, access: object, correlationId: string, reason?: string }>}
 */
export async function permissionGate(request, permission, opts = {}) {
  const principal = getClientPrincipal(request);
  const access = await resolveStudioAccess(principal, opts);
  const correlationId = newCorrelationId();
  if (!access.signedIn) {
    return { allowed: false, signedIn: false, principal, access, correlationId };
  }
  if (!hasPermission(access, permission)) {
    return { allowed: false, signedIn: true, principal, access, correlationId };
  }
  const reason = access.source === 'development' ? 'development' : undefined;
  return { allowed: true, signedIn: true, principal, access, correlationId, reason };
}

/** Publish-capable routes — `content.publish` from the same catalog as People. */
export async function publisherGate(request, opts = {}) {
  return permissionGate(request, PERMISSION.CONTENT_PUBLISH, opts);
}

export function sessionPayload(access, { publishMode, correlationId } = {}) {
  const authorized = hasPermission(access, PERMISSION.CONTENT_PUBLISH);
  const identity = publisherIdentity(access.principal);
  const signedIn = Boolean(access.signedIn);
  const noCapabilities = (access.permissions || []).length === 0;
  return {
    signedIn,
    authorized,
    roles: access.roles || [],
    permissions: access.permissions || [],
    source: access.source,
    catalog: accessCatalog(),
    ...(publishMode ? { publishMode } : {}),
    ...(signedIn
      ? {
          userId: identity.userId || undefined,
          userDetails: identity.userDetails || undefined,
        }
      : {}),
    ...(correlationId && signedIn && noCapabilities ? { correlationId } : {}),
  };
}

export { PERMISSION };
