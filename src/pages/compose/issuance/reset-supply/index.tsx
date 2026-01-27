import { useParams } from "react-router-dom";
import { Composer } from "@/components/composer";
import { ErrorAlert } from "@/components/error-alert";
import { ResetSupplyForm } from "./form";
import { ReviewIssuanceResetSupply } from "./review";
import { composeIssuance } from "@/utils/blockchain/counterparty/compose";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty/compose";

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
