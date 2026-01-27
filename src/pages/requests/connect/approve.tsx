import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiGlobe, FiShield, FiX, FaCheck } from "@/components/icons";
import { Button } from "@/components/button";
import { useWallet } from "@/contexts/wallet-context";
import { useHeader } from "@/contexts/header-context";
import { getApprovalService } from "@/services/approvalService";
import type { ReactElement } from "react";

/**
 * Connection approval page for dApp requests
 * Shows when a website requests access to the wallet
 */
export default function ApproveConnectionPage(): ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeAddress, activeWallet, isLoading } = useWallet();
  const { setHeaderProps } = useHeader();
  const [isProcessing, setIsProcessing] = useState(false);
  
  const origin = searchParams.get("origin") || "";
  const requestId = searchParams.get("requestId") || "";
  
  // Parse the origin to get a friendly domain name
  const getDomain = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  };
  
  const domain = getDomain(origin);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Connection Request",
      rightButton: {
        icon: <FiX className="size-4" aria-hidden="true" />,
        onClick: () => handleReject(),
        ariaLabel: "Reject connection",
      },
    });
  }, [setHeaderProps]);
  
  useEffect(() => {
    // Wait for wallet context to finish loading before redirecting
    if (isLoading) return;

    // If no active wallet/address after loading, redirect to unlock
    if (!activeWallet || !activeAddress) {
      navigate("/");
    }
  }, [activeWallet, activeAddress, isLoading, navigate]);
  
  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      // Resolve approval via ApprovalService proxy
      const approvalService = getApprovalService();
      await approvalService.resolveApproval(requestId, { approved: true });
      // Close the popup
      window.close();
    } catch (error) {
      console.error("Failed to approve connection:", error);
      setIsProcessing(false);
    }
  };
  
  const handleReject = async () => {
    setIsProcessing(true);
    try {
      // Reject approval via ApprovalService proxy
      const approvalService = getApprovalService();
      await approvalService.rejectApproval(requestId, 'User denied the request');
      // Close the popup
      window.close();
    } catch (error) {
      console.error("Failed to reject connection:", error);
      setIsProcessing(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-dvh p-4">
        <div className="text-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!activeAddress || !activeWallet) {
    return (
      <div className="flex items-center justify-center h-dvh p-4">
        <div className="text-center">
          <p className="text-gray-500">Please unlock your wallet first</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        <div className="max-w-md mx-auto space-y-6">
          {/* Site info */}
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            <div className="inline-flex items-center justify-center size-16 bg-blue-100 rounded-full mb-4">
              <FiGlobe className="size-8 text-blue-600" aria-hidden="true" />
            </div>
            
            <h2 className="text-xl font-semibold mb-2">{domain}</h2>
            <p className="text-sm text-gray-500 break-all">{origin}</p>
            
            <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
              <p className="text-sm text-yellow-800">
                This site is requesting access to view your wallet address
              </p>
            </div>
          </div>
          
          {/* Wallet info */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-sm font-medium text-gray-700 mb-3">Connect with:</h2>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {activeWallet.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {activeAddress.address}
                  </p>
                </div>
                <div className="ml-3">
                  <div className="size-2 bg-green-500 rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Permissions */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-sm font-medium text-gray-700 mb-3">
              This site will be able to:
            </h2>
            
            <ul className="space-y-2">
              <li className="flex items-start">
                <FaCheck className="size-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-gray-600">
                  View your wallet address
                </span>
              </li>
              <li className="flex items-start">
                <FaCheck className="size-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-gray-600">
                  Request transaction signatures (requires approval)
                </span>
              </li>
            </ul>
            
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <div className="flex items-start">
                <FiShield className="size-4 text-blue-600 mt-0.5 mr-2 flex-shrink-0" aria-hidden="true" />
                <p className="text-xs text-blue-800">
                  You can revoke this permission at any time in Settings
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Actions */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="max-w-md mx-auto grid grid-cols-2 gap-3">
          <Button
            color="gray"
            onClick={handleReject}
            disabled={isProcessing}
            fullWidth
          >
            Cancel
          </Button>
          <Button
            color="blue"
            onClick={handleApprove}
            disabled={isProcessing}
            fullWidth
          >
            {isProcessing ? "Processing…" : "Connect"}
          </Button>
        </div>
      </div>
    </div>
  );
}