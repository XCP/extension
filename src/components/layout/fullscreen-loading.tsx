import type { ReactElement } from 'react';
import { FaSpinner } from '@/components/icons';
import { t } from '@/i18n';

/** Full-window spinner: while the wallet state loads, and while a page's code loads. */
export function FullscreenLoading(): ReactElement {
  return (
    <div role="status" className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900">
      <FaSpinner className="text-4xl text-primary-600 animate-spin" aria-hidden="true" />
      <span className="sr-only">{t('common_loading')}</span>
    </div>
  );
}
