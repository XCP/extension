import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import type { IssuanceOptions } from "@/core/counterparty/compose";
import { composeIssuance } from "@/core/counterparty/compose";
import { LockDescriptionForm } from "@/pages/compose/issuance/lock-description/form";
import { ReviewLockDescription } from "@/pages/compose/issuance/lock-description/review";

/**
 * ComposeLockDescription handles the lock description flow for an asset.
 * This creates an issuance transaction with description="LOCK_DESCRIPTION" to permanently
 * prevent future description changes.
 */
function ComposeLockDescriptionPage() {
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
        composeType="issuance"
        composeApiMethod={composeIssuance}
        initialTitle="Lock Description"
        FormComponent={(props) => (
          <LockDescriptionForm {...props} asset={asset} />
        )}
        ReviewComponent={ReviewLockDescription}
      />
    </div>
  );
}

export default ComposeLockDescriptionPage;