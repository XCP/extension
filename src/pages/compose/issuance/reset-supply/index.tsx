import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { IssuanceOptions } from "@/core/counterparty/compose";
import { composeIssuance } from "@/core/counterparty/compose";
import { ResetSupplyForm } from "@/pages/compose/issuance/reset-supply/form";
import { ReviewIssuanceResetSupply } from "@/pages/compose/issuance/reset-supply/review";

function ComposeResetSupplyPage() {
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
        initialTitle="Reset Supply"
        FormComponent={(props) => <ResetSupplyForm {...props} asset={asset} />}
        ReviewComponent={ReviewIssuanceResetSupply}
      />
    </div>
  );
}

export default ComposeResetSupplyPage;
