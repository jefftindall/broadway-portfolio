/** Studio workflow nav + contextual help targets. Help is not a workflow tab. */

export type StudioNavItem = {
  href: string;
  label: string;
};

export const STUDIO_NAV: StudioNavItem[] = [
  { href: '/studio/career', label: 'Career' },
  { href: '/studio/content', label: 'Content' },
  { href: '/studio/students', label: 'Students' },
  { href: '/studio/admin', label: 'Admin' },
];

function normalizeStudioPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

export function isStudioNavActive(href: string, pathname: string): boolean {
  const path = normalizeStudioPath(pathname);
  if (href === '/studio/career') return path === '/studio/career' || path.startsWith('/studio/career/');
  if (href === '/studio/content') return path === '/studio/content' || path.startsWith('/studio/content/');
  if (href === '/studio/students') {
    return (
      path === '/studio/students' ||
      path.startsWith('/studio/students/') ||
      path === '/studio/people' ||
      path.startsWith('/studio/people/') ||
      path === '/studio/calendar' ||
      path.startsWith('/studio/calendar/')
    );
  }
  if (href === '/studio/admin') return path === '/studio/admin' || path.startsWith('/studio/admin/');
  return false;
}

/** Contextual help for the current Studio screen. */
export function studioHelpHref(pathname: string): string {
  const path = normalizeStudioPath(pathname);
  if (path.startsWith('/studio/help')) return '/studio/help';
  if (path.startsWith('/studio/content')) return '/studio/help/content';
  if (path === '/studio/admin/access' || path.startsWith('/studio/admin/access/')) {
    return '/studio/help/access';
  }
  if (path === '/studio/admin/calendar' || path.startsWith('/studio/admin/calendar/')) {
    return '/studio/help/calendar';
  }
  if (path === '/studio/admin' || path.startsWith('/studio/admin/')) return '/studio/help/admin';
  if (path === '/studio/calendar' || path.startsWith('/studio/calendar/')) {
    return '/studio/help/calendar';
  }
  if (
    path === '/studio/people' ||
    path.startsWith('/studio/people/') ||
    path === '/studio/students' ||
    path.startsWith('/studio/students/')
  ) {
    return '/studio/help/students';
  }
  if (path === '/studio/career' || path.startsWith('/studio/career/')) return '/studio/help/career';
  return '/studio/help';
}

export const STUDIO_SIGN_OUT_HREF = '/.auth/logout?post_logout_redirect_uri=/';
