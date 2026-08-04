import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { IssuanceOptions } from "@/core/counterparty/compose";
import { composeIssuance } from "@/core/counterparty/compose";
import { LockSupplyForm } from "@/pages/compose/issuance/lock-supply/form";
import { ReviewIssuanceLockSupply } from "@/pages/compose/issuance/lock-supply/review";

function ComposeLockSupplyPage() {
  const { asset } = useParams<{ asset?: string }>();

  if (!asset) {
    return (
      <div className="p-4">
        <ErrorAlert message="Asset parameter is required" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <Composer<IssuanceOptions>
        composeType="issuance"
        composeApiMethod={composeIssuance}
        initialTitle="Lock Supply"
        FormComponent={(props) => <LockSupplyForm {...props} asset={asset} />}
        ReviewComponent={ReviewIssuanceLockSupply}
      />
    </div>
  );
}

export default ComposeLockSupplyPage;
