import { useEffect } from 'react';
import { analytics } from '@/utils/fathom';

const NotFound = () => {
  useEffect(() => {
    analytics.track('not_found');
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold">Not Found</h2>
      <p>This is a placeholder.</p>
    </div>
  );
};

export default NotFound;
