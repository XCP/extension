import { useSyncExternalStore } from 'react';
import { localeSnapshot, subscribeLocale } from '@/i18n';

/** Re-render in place; never key/remount a form when presentation preferences change. */
export function useLocaleRevision(): string {
  return useSyncExternalStore(subscribeLocale, localeSnapshot, localeSnapshot);
}
