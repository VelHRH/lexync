import { cookies } from 'next/headers';

export const navigationCollapsedCookie = 'lexync_nav_collapsed';

export async function readNavigationCollapsed(): Promise<boolean> {
  const store = await cookies();
  return store.get(navigationCollapsedCookie)?.value === 'true';
}
