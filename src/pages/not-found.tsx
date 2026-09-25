import { useEffect } from 'react';
import { t } from '@/i18n';
import { analytics } from '@/platform/fathom';

const NotFound = () => {
  useEffect(() => {
    analytics.track('not_found');
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold">{t('not_found')}</h2>
      <p>{t('not_found_this_is_a_placeholder')}</p>
    </div>
  );
};

export default NotFound;
