/**
 * Studio session — roles and discrete permissions from GET /api/studioSession.
 * Enforcement stays on the API; this is UI gating only.
 */

export const STUDIO_PERMISSION = {
  CONTENT_PUBLISH: 'content.publish',
  PEOPLE_READ: 'people.read',
  PEOPLE_WRITE: 'people.write',
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  CALENDAR_CONNECT: 'calendar.connect',
  CALENDAR_READ: 'calendar.read',
  CALENDAR_WRITE: 'calendar.write',
} as const;

export type StudioPermission = (typeof STUDIO_PERMISSION)[keyof typeof STUDIO_PERMISSION];

export type StudioSession = {
  signedIn: boolean;
  authorized: boolean;
  roles: string[];
  permissions: string[];
  source?: string;
  publishMode?: 'pr' | 'direct';
  /** Same SWA flag as public Payment Links — gates Calendar + Schedules UI. */
  lessonSchedulingEnabled?: boolean;
  correlationId?: string;
  catalog?: {
    permissions: Array<{ id: string; label: string; description: string }>;
    roles: Array<{ id: string; label: string; description: string; permissions: string[] }>;
  };
  apiUnavailable?: boolean;
};

export function hasStudioPermission(
  session: StudioSession | null | undefined,
  permission: string,
): boolean {
  return Boolean(session?.permissions?.includes(permission));
}

export async function fetchStudioSession(): Promise<StudioSession> {
  try {
    const res = await fetch('/api/studioSession', { headers: { Accept: 'application/json' } });
    if (!res.ok) return { signedIn: false, authorized: false, roles: [], permissions: [], apiUnavailable: true };
    const data = (await res.json()) as StudioSession;
    return {
      signedIn: Boolean(data?.signedIn),
      authorized: Boolean(data?.authorized),
      roles: Array.isArray(data?.roles) ? data.roles : [],
      permissions: Array.isArray(data?.permissions) ? data.permissions : [],
      source: data?.source,
      publishMode: data?.publishMode === 'pr' ? 'pr' : 'direct',
      lessonSchedulingEnabled: Boolean(data?.lessonSchedulingEnabled),
      correlationId: typeof data?.correlationId === 'string' ? data.correlationId : undefined,
      catalog: data?.catalog,
    };
  } catch {
    return { signedIn: false, authorized: false, roles: [], permissions: [], apiUnavailable: true };
  }
}
