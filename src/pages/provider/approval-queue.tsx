import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiX, FiAlertCircle, FiGlobe, FiEdit, FiLock, FiSend } from 'react-icons/fi';
import { Button } from '@/components/button';
import { type ApprovalRequest } from '@/utils/provider/approvalQueue';
import { formatAddress } from '@/utils/format';
import { getProviderService } from '@/services/providerService';
import { useHeader } from '@/contexts/header-context';

export default function ApprovalQueue() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const getRequestTitle = (request: ApprovalRequest) => {
    switch (request.type) {
      case 'connection':
        return 'Connection Request';
      case 'transaction':
        return 'Transaction Signature';
      case 'compose':
        return 'Transaction Creation';
      case 'signature':
        return 'Message Signature';
      default:
        return 'Approval Request';
    }
  };

  // Configure header based on current request
  useEffect(() => {
    const currentRequest = requests[currentIndex];
    const title = currentRequest 
      ? `${getRequestTitle(currentRequest)}${requests.length > 1 ? ` (${currentIndex + 1}/${requests.length})` : ''}`
      : "Approval Queue";
      
    setHeaderProps({
      title,
      rightButton: {
        icon: <FiX className="w-4 h-4" />,
        onClick: () => window.close(),
        ariaLabel: "Close",
      },
    });
  }, [setHeaderProps, requests, currentIndex]);

  useEffect(() => {
    const providerService = getProviderService();
    
    // Load initial queue from background
    const loadQueue = async () => {
      try {
        const queue = await providerService.getApprovalQueue();
        setRequests(queue);
        setIsLoading(false);
        
        // If queue is empty on load, close the window
        if (queue.length === 0) {
          window.close();
        }
      } catch (error) {
        console.error('Failed to load approval queue:', error);
        setIsLoading(false);
      }
    };
    
    loadQueue();
    
    // Poll for updates every second
    const interval = setInterval(loadQueue, 1000);
    
    return () => clearInterval(interval);
  }, []);

  const currentRequest = requests[currentIndex];

  const handleTimeout = async () => {
    // Request has expired, show user feedback and remove
    if (currentRequest) {
      const providerService = getProviderService();
      await providerService.removeApprovalRequest(currentRequest.id);
    }
  };

  const handleApprove = async () => {
    if (!currentRequest) return;

    try {
      // Send approval to background
      await browser.runtime.sendMessage({
        type: 'RESOLVE_PROVIDER_REQUEST',
        requestId: currentRequest.id,
        approved: true
      });

      // Remove from queue via provider service
      const providerService = getProviderService();
      await providerService.removeApprovalRequest(currentRequest.id);

      // Move to next request or close if done
      if (currentIndex >= requests.length - 1) {
        if (requests.length === 1) {
          window.close();
        } else {
          setCurrentIndex(Math.max(0, currentIndex - 1));
        }
      }
    } catch (error) {
      console.error('Failed to approve request:', error);
    }
  };

  const handleReject = async () => {
    if (!currentRequest) return;

    try {
      // Send rejection to background
      await browser.runtime.sendMessage({
        type: 'RESOLVE_PROVIDER_REQUEST',
        requestId: currentRequest.id,
        approved: false
      });

      // Remove from queue via provider service
      const providerService = getProviderService();
      await providerService.removeApprovalRequest(currentRequest.id);

      // Move to next request or close if done
      if (currentIndex >= requests.length - 1) {
        if (requests.length === 1) {
          window.close();
        } else {
          setCurrentIndex(Math.max(0, currentIndex - 1));
        }
      }
    } catch (error) {
      console.error('Failed to reject request:', error);
    }
  };

  const handleRejectAll = async () => {
    if (confirm(`Reject all ${requests.length} pending requests?`)) {
      const providerService = getProviderService();
      for (const request of requests) {
        try {
          await browser.runtime.sendMessage({
            type: 'RESOLVE_PROVIDER_REQUEST',
            requestId: request.id,
            approved: false
          });
          await providerService.removeApprovalRequest(request.id);
        } catch (error) {
          console.error('Failed to reject request:', error);
        }
      }
      window.close();
    }
  };

  const getRequestIcon = (type: ApprovalRequest['type']) => {
    switch (type) {
      case 'connection':
        return <FiGlobe className="w-5 h-5" />;
      case 'transaction':
        return <FiSend className="w-5 h-5" />;
      case 'compose':
        return <FiEdit className="w-5 h-5" />;
      case 'signature':
        return <FiLock className="w-5 h-5" />;
      default:
        return <FiAlertCircle className="w-5 h-5" />;
    }
  };

  const getDomain = (origin: string) => {
    try {
      const url = new URL(origin);
      return url.hostname;
    } catch {
      return origin;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen p-4">
        <div className="text-center">
          <p className="text-gray-500">Loading approvals...</p>
        </div>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen p-4">
        <div className="text-center">
          <p className="text-gray-500">No pending approvals</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* Queue Navigation (if multiple) */}
      {requests.length > 1 && (
        <div className="bg-white border-b border-gray-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex gap-1 overflow-x-auto">
              {requests.map((req, idx) => (
                <button
                  key={req.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`p-2 rounded flex items-center gap-2 ${
                    idx === currentIndex
                      ? 'bg-blue-100 text-blue-700'
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                  title={`${getRequestTitle(req)} from ${getDomain(req.origin)}`}
                >
                  {getRequestIcon(req.type)}
                  <span className="text-xs font-medium">
                    {getDomain(req.origin).substring(0, 15)}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={handleRejectAll}
              className="text-xs text-red-600 hover:text-red-700 font-medium whitespace-nowrap ml-2"
            >
              Reject All
            </button>
          </div>
        </div>
      )}

      {/* Current Request Content */}
      <div className="flex-1 overflow-y-auto">
        {currentRequest.type === 'connection' && (
          <ConnectionApproval request={currentRequest} />
        )}
        {currentRequest.type === 'compose' && (
          <ComposeApproval request={currentRequest} />
        )}
        {currentRequest.type === 'transaction' && (
          <TransactionApproval request={currentRequest} />
        )}
        {currentRequest.type === 'signature' && (
          <SignatureApproval request={currentRequest} />
        )}
      </div>

      {/* Actions */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Button color="gray" onClick={handleReject} fullWidth>
            Reject
          </Button>
          <Button color="blue" onClick={handleApprove} fullWidth>
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}

// Sub-components for different approval types
function ConnectionApproval({ request }: { request: ApprovalRequest }) {
  const domain = getDomain(request.origin);
  
  function getDomain(origin: string) {
    try {
      return new URL(origin).hostname;
    } catch {
      return origin;
    }
  }

  return (
    <div className="p-4">
      <div className="bg-white rounded-lg shadow-sm p-4 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
          <FiGlobe className="w-6 h-6 text-blue-600" />
        </div>
        <h2 className="text-lg font-semibold mb-1">{domain}</h2>
        <p className="text-xs text-gray-500 break-all mb-3">{request.origin}</p>
        <div className="p-3 bg-yellow-50 rounded-lg">
          <p className="text-sm text-yellow-800">
            This site is requesting access to view your wallet address
          </p>
        </div>
      </div>
    </div>
  );
}

function ComposeApproval({ request }: { request: ApprovalRequest }) {
  const domain = getDomain(request.origin);
  
  function getDomain(origin: string) {
    try {
      return new URL(origin).hostname;
    } catch {
      return origin;
    }
  }

  // Navigate to the dedicated compose approval page
  useEffect(() => {
    const url = `/provider/approve-compose?origin=${encodeURIComponent(request.origin)}&requestId=${request.id}&params=${encodeURIComponent(JSON.stringify(request.params))}`;
    window.location.hash = url;
  }, [request]);

  return (
    <div className="p-4">
      <p className="text-gray-500">Loading transaction details...</p>
    </div>
  );
}

function TransactionApproval({ request }: { request: ApprovalRequest }) {
  const domain = getDomain(request.origin);
  
  function getDomain(origin: string) {
    try {
      return new URL(origin).hostname;
    } catch {
      return origin;
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-medium mb-2">Sign Transaction</h3>
        <p className="text-sm text-gray-600">{domain} wants to sign a transaction</p>
        <div className="mt-4 p-3 bg-gray-50 rounded text-xs font-mono break-all">
          {request.params?.[0]?.substring(0, 100)}...
        </div>
      </div>
    </div>
  );
}

function SignatureApproval({ request }: { request: ApprovalRequest }) {
  const domain = getDomain(request.origin);
  
  function getDomain(origin: string) {
    try {
      return new URL(origin).hostname;
    } catch {
      return origin;
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-medium mb-2">Sign Message</h3>
        <p className="text-sm text-gray-600">{domain} wants you to sign a message</p>
        <div className="mt-4 p-3 bg-gray-50 rounded">
          <p className="text-sm">{request.params?.[0]}</p>
        </div>
      </div>
    </div>
  );
}