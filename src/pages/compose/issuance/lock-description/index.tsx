import { useParams } from "react-router-dom";
import { Composer } from "@/components/composer";
import { LockDescriptionForm } from "./form";
import { ReviewLockDescription } from "./review";
import { composeIssuance } from "@/utils/blockchain/counterparty";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";

/**
 * ComposeLockDescription handles the lock description flow for an asset.
 * This creates an issuance transaction with description="LOCK" to permanently
 * prevent future description changes.
 */
function ComposeLockDescription() {
  const { asset } = useParams<{ asset?: string }>();

  if (!asset) {
    return (
      <div className="p-4 text-center text-red-600">
        Asset parameter is required
      </div>
    );
  }

  return (
    <div className="p-4">
      <Composer<IssuanceOptions>
        initialTitle="Lock Description"
        FormComponent={(props) => (
          <LockDescriptionForm {...props} asset={asset} />
        )}
        ReviewComponent={ReviewLockDescription}
        composeApiMethod={composeIssuance}
      />
    </div>
  );
}

export default ComposeLockDescription;