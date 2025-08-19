import { useState } from 'react';
import { Dialog } from '@headlessui/react';
import { FaExclamationTriangle, FaShieldAlt, FaTimes } from 'react-icons/fa';
import { Button } from '@/components/button';
import { analyzePhishingRisk, type PhishingAnalysis } from '@/utils/security/phishingDetection';
import { trackEvent } from '@/utils/fathom';

interface PhishingWarningProps {
  origin: string;
  isOpen: boolean;
  onAccept: () => void;
  onReject: () => void;
}

export function PhishingWarning({ origin, isOpen, onAccept, onReject }: PhishingWarningProps) {
  const [analysis, setAnalysis] = useState<PhishingAnalysis>(() => analyzePhishingRisk(origin));
  const [showDetails, setShowDetails] = useState(false);
  const [showAllReasons, setShowAllReasons] = useState(false);

  const getHostname = (url: string) => {
    try {
      // If URL doesn't have protocol, add one temporarily
      const urlToParse = url.includes('://') ? url : `https://${url}`;
      return new URL(urlToParse).hostname;
    } catch {
      // If URL parsing fails, return the original string
      return url;
    }
  };

  const hostname = getHostname(origin);

  const handleAccept = async () => {
    await trackEvent('phishing_warning_accepted');
    onAccept();
  };

  const handleReject = async () => {
    await trackEvent('phishing_warning_rejected');
    onReject();
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-red-500 bg-red-50 border-red-200';
      case 'medium': return 'text-orange-500 bg-orange-50 border-orange-200';
      default: return 'text-yellow-500 bg-yellow-50 border-yellow-200';
    }
  };

  const getRiskIcon = (level: string) => {
    const className = "w-6 h-6";
    switch (level) {
      case 'critical':
      case 'high':
        return <FaExclamationTriangle className={`${className} text-red-500`} data-testid="warning-icon" />;
      default:
        return <FaShieldAlt className={`${className} text-orange-500`} data-testid="shield-icon" />;
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onClose={onReject} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-md rounded-lg bg-white p-6 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              {getRiskIcon(analysis.riskLevel)}
              <Dialog.Title className="text-lg font-semibold text-gray-900">
                Security Warning
              </Dialog.Title>
            </div>
            <button
              onClick={onReject}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close"
            >
              <FaTimes className="w-4 h-4" data-testid="close-icon" />
            </button>
          </div>

          {/* Risk Level Badge */}
          <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mb-4 ${getRiskColor(analysis.riskLevel)}`}>
            Risk Level: {analysis.riskLevel.toUpperCase()}
          </div>

          {/* Main Message */}
          <div className="mb-4">
            <p className="text-gray-700 mb-2">
              The website <strong>{hostname}</strong> {analysis.isBlocked ? 'is known to be malicious' : 'appears to be suspicious'} and may be attempting to phish your credentials.
            </p>
            
            {/* Show trusted alternative if available */}
            {analysis.trustedAlternative && (
              <div className="bg-green-50 rounded-lg p-3 mb-3 border border-green-200">
                <p className="text-sm text-green-800">
                  <span>Did you mean to visit:</span> <strong>{analysis.trustedAlternative}</strong>?
                </p>
              </div>
            )}
            
            {/* Show reasons */}
            {analysis.reasons && analysis.reasons.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-medium text-gray-700 mb-2">Why this site is flagged:</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  {(showAllReasons ? analysis.reasons : analysis.reasons.slice(0, 2)).map((reason, index) => (
                    <li key={index}>• <span>{reason}</span></li>
                  ))}
                </ul>
                {analysis.reasons.length > 2 && (
                  <button
                    onClick={() => setShowAllReasons(!showAllReasons)}
                    className="text-blue-600 hover:text-blue-800 text-sm mt-2"
                  >
                    <span>{showAllReasons ? 'Show less' : `Show ${analysis.reasons.length - 2} more reason(s)`}</span>
                  </button>
                )}
                {showAllReasons && analysis.suggestions && analysis.suggestions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-sm font-medium text-gray-700 mb-1">Suggestions:</p>
                    <ul className="text-sm text-gray-600 space-y-1">
                      {analysis.suggestions.map((suggestion, index) => (
                        <li key={index}>• <span>{suggestion}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Warning Message */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-800">
              <strong>⚠️ Warning:</strong> Connecting to suspicious sites may result in:
            </p>
            <ul className="text-xs text-red-700 mt-1 ml-4 space-y-1">
              <li>• Theft of your wallet funds</li>
              <li>• Exposure of transaction history</li>
              <li>• Malicious transaction approvals</li>
              <li>• Identity and privacy compromise</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <Button
              onClick={handleReject}
              color="gray"
              fullWidth
              className="flex-1"
            >
              <FaShieldAlt className="w-4 h-4 mr-2" data-testid="shield-icon" />
              Stay Safe
            </Button>
            
            <Button
              onClick={handleAccept}
              color="red"
              fullWidth
              className="flex-1"
              variant="transparent"
            >
              <FaExclamationTriangle className="w-4 h-4 mr-2" data-testid="warning-icon" />
              Proceed Anyway
            </Button>
          </div>

          {/* Footer */}
          <p className="text-xs text-gray-500 mt-4 text-center">
            This warning helps protect you from phishing attacks. Always verify URLs carefully.
          </p>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}