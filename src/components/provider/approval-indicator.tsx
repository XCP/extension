import { useState, useEffect } from 'react';
import { FiAlertCircle } from 'react-icons/fi';
import { approvalQueue, type ApprovalRequest } from '@/utils/provider/approvalQueue';
import { useNavigate } from 'react-router-dom';

/**
 * Shows an indicator when there are pending approval requests
 * Can be added to the main wallet UI to let users know there are pending requests
 */
export function ApprovalIndicator() {
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);

  useEffect(() => {
    // Get initial count
    const queue = approvalQueue.getAll();
    setPendingCount(queue.length);
    setRequests(queue);

    // Subscribe to changes
    const unsubscribe = approvalQueue.subscribe((newQueue) => {
      setPendingCount(newQueue.length);
      setRequests(newQueue);
    });

    return unsubscribe;
  }, []);

  if (pendingCount === 0) {
    return null;
  }

  const handleClick = () => {
    // Navigate to approval queue or open in new window
    if (typeof browser !== 'undefined' && browser?.windows?.create) {
      // Open in popup window
      browser.windows.create({
        url: browser.runtime.getURL('/popup.html#/provider/approval-queue'),
        type: 'popup',
        width: 350,
        height: 600,
        focused: true
      });
    } else {
      // Navigate within current context
      navigate('/provider/approval-queue');
    }
  };

  // Get unique origins
  const uniqueOrigins = new Set(requests.map(r => {
    try {
      return new URL(r.origin).hostname;
    } catch {
      return r.origin;
    }
  }));

  return (
    <button
      onClick={handleClick}
      className="relative flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
    >
      <FiAlertCircle className="w-4 h-4 text-orange-600" />
      <div className="text-left">
        <p className="text-sm font-medium text-orange-900">
          {pendingCount} Pending Approval{pendingCount !== 1 ? 's' : ''}
        </p>
        <p className="text-xs text-orange-700">
          From {uniqueOrigins.size} site{uniqueOrigins.size !== 1 ? 's' : ''}
        </p>
      </div>
      
      {/* Badge */}
      {pendingCount > 1 && (
        <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] text-center">
          {pendingCount > 99 ? '99+' : pendingCount}
        </span>
      )}
    </button>
  );
}

/**
 * Compact version for use in headers/toolbars
 */
export function ApprovalIndicatorCompact() {
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const queue = approvalQueue.getAll();
    setPendingCount(queue.length);

    const unsubscribe = approvalQueue.subscribe((newQueue) => {
      setPendingCount(newQueue.length);
    });

    return unsubscribe;
  }, []);

  if (pendingCount === 0) {
    return null;
  }

  const handleClick = () => {
    if (typeof browser !== 'undefined' && browser?.windows?.create) {
      browser.windows.create({
        url: browser.runtime.getURL('/popup.html#/provider/approval-queue'),
        type: 'popup',
        width: 350,
        height: 600,
        focused: true
      });
    } else {
      navigate('/provider/approval-queue');
    }
  };

  return (
    <button
      onClick={handleClick}
      className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
      title={`${pendingCount} pending approval${pendingCount !== 1 ? 's' : ''}`}
    >
      <FiAlertCircle className="w-5 h-5 text-orange-600" />
      {pendingCount > 0 && (
        <span className="absolute -top-1 -right-1 px-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center">
          {pendingCount > 9 ? '9+' : pendingCount}
        </span>
      )}
    </button>
  );
}