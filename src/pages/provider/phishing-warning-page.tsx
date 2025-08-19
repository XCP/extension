import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PhishingWarning } from '@/components/security/phishing-warning';
import { analyzePhishingRisk } from '@/utils/security/phishingDetection';
import { trackEvent } from '@/utils/fathom';

/**
 * Page that displays phishing warnings for suspicious domains
 * before allowing connection approval to proceed
 */
export default function PhishingWarningPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);
  
  const origin = searchParams.get('origin');
  const returnTo = searchParams.get('returnTo') || '/provider/approval-queue';
  
  useEffect(() => {
    if (!origin) {
      navigate(returnTo);
      return;
    }
    
    // Track that phishing warning was shown
    const analysis = analyzePhishingRisk(origin);
    trackEvent('phishing_warning_shown');
  }, [origin, navigate, returnTo]);
  
  const handleAccept = () => {
    setIsOpen(false);
    // Return to approval queue with acceptance flag
    navigate(`${returnTo}?phishingAccepted=true`);
  };
  
  const handleReject = () => {
    setIsOpen(false);
    // Navigate away or show rejection message
    navigate('/');
  };
  
  if (!origin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-4">Invalid Request</h1>
          <p className="text-gray-600">No origin specified for phishing check.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <PhishingWarning
          origin={origin}
          isOpen={isOpen}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      </div>
    </div>
  );
}