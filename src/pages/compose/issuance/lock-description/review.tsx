import { useAssetDetails } from "@/hooks/useAssetDetails";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";
import { TransactionDetail, SectionTitle } from "@/components/transaction/detail";
import { AssetHeader } from "@/components/headers/asset-header";
import { FaExclamationTriangle } from "react-icons/fa";
import type { ReactElement } from "react";

/**
 * Props for the ReviewLockDescription component.
 */
interface ReviewLockDescriptionProps {
  formData: IssuanceOptions;
  estimatedFee?: number;
}

/**
 * ReviewLockDescription displays the transaction details for review before submission.
 * @param {ReviewLockDescriptionProps} props - Component props
 * @returns {ReactElement} Review UI for lock description transaction
 */
export function ReviewLockDescription({ 
  formData, 
  estimatedFee 
}: ReviewLockDescriptionProps): ReactElement {
  const { data: assetDetails } = useAssetDetails(formData.asset);

  return (
    <div className="space-y-4">
      <AssetHeader
        assetInfo={{
          asset: formData.asset,
          asset_longname: assetDetails?.assetInfo?.asset_longname || null,
          description: assetDetails?.assetInfo?.description,
          issuer: assetDetails?.assetInfo?.issuer,
          divisible: assetDetails?.assetInfo?.divisible ?? false,
          locked: assetDetails?.assetInfo?.locked ?? false,
          supply: assetDetails?.assetInfo?.supply
        }}
        className="mt-1 mb-5"
      />
      
      {/* Warning banner */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <FaExclamationTriangle className="text-red-500 mt-1 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-800 mb-1">
              Permanent Action Warning
            </h3>
            <p className="text-sm text-red-700">
              You are about to permanently lock the description for <strong>{formData.asset}</strong>. 
              This action cannot be undone. The current description will remain forever.
            </p>
          </div>
        </div>
      </div>

      <SectionTitle>Transaction Details</SectionTitle>
      
      <div className="space-y-3">
        <TransactionDetail
          label="Action"
          value="Lock Description"
          valueClassName="text-red-600 font-medium"
        />
        
        <TransactionDetail
          label="Asset"
          value={formData.asset}
        />
        
        <TransactionDetail
          label="Current Description"
          value={assetDetails?.assetInfo?.description || "(empty)"}
          valueClassName="text-sm"
        />
        
        <TransactionDetail
          label="New Status"
          value="Description will be permanently locked"
          valueClassName="text-sm text-red-600"
        />
        
        {estimatedFee !== undefined && (
          <TransactionDetail
            label="Estimated Fee"
            value={`${(estimatedFee / 100_000_000).toFixed(8)} BTC`}
          />
        )}
      </div>

      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <p className="text-xs text-gray-600">
          <strong>Technical Details:</strong> This will create an issuance transaction 
          with description="LOCK" which permanently prevents future description changes 
          according to the Counterparty protocol rules.
        </p>
      </div>
    </div>
  );
}