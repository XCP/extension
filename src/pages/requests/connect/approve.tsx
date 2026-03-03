import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiGlobe, FaCheck } from "@/components/icons";
import { Button } from "@/components/ui/button";
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
  const [faviconError, setFaviconError] = useState(false);

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
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Wallet Connect",
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
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto">
          {/* Wallet info - shown at top */}
          <div className="flex items-center justify-between mb-6">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {activeWallet.name}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {activeAddress.address}
              </p>
            </div>
            <div className="ml-3 flex-shrink-0">
              <div className="size-2.5 bg-green-500 rounded-full"></div>
            </div>
          </div>

          {/* Site info card */}
          <div className="bg-gray-50 rounded-xl p-5 text-center">
            <div className="inline-flex items-center justify-center size-14 bg-blue-100 rounded-full mb-3">
              {faviconError ? (
                <FiGlobe className="size-7 text-blue-600" aria-hidden="true" />
              ) : (
                <img
                  src={faviconUrl}
                  alt={`${domain} favicon`}
                  className="size-7 rounded"
                  onError={() => setFaviconError(true)}
                />
              )}
            </div>

            <h2 className="text-lg font-bold text-gray-900 mb-0.5">{domain}</h2>
            <p className="text-xs text-gray-400 break-all">{origin}</p>

            <div className="mt-4 p-2.5 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm text-yellow-800">
                This site is requesting access to view your wallet address
              </p>
            </div>
          </div>

          {/* Permissions */}
          <div className="mt-4 px-1">
            <p className="text-xs font-medium text-gray-500 mb-2">This site will be able to:</p>
            <ul className="space-y-1.5">
              <li className="flex items-center">
                <FaCheck className="size-3.5 text-green-500 mr-2 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-gray-600">View your wallet address</span>
              </li>
              <li className="flex items-center">
                <FaCheck className="size-3.5 text-green-500 mr-2 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-gray-600">Request transaction signatures</span>
              </li>
              <li className="flex items-center">
                <FaCheck className="size-3.5 text-green-500 mr-2 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-gray-600">Request message signatures</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Actions - pinned to bottom */}
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