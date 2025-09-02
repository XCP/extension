import { useParams } from "react-router-dom";
import { Composer } from "@/components/composer";
import { ErrorAlert } from "@/components/error-alert";
import { ResetSupplyForm } from "./form";
import { ReviewIssuanceResetSupply } from "./review";
import { composeIssuance } from "@/utils/blockchain/counterparty";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";

export function ComposeIssuanceResetSupply() {
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
        initialTitle="Reset Supply"
        FormComponent={(props) => <ResetSupplyForm {...props} asset={asset} />}
        ReviewComponent={ReviewIssuanceResetSupply}
        composeApiMethod={composeIssuance}
      />
    </div>
  );
}

export default ComposeIssuanceResetSupply;
