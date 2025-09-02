import { useParams } from "react-router-dom";
import { Composer } from "@/components/composer";
import { ErrorAlert } from "@/components/error-alert";
import { LockSupplyForm } from "./form";
import { ReviewIssuanceLockSupply } from "./review";
import { composeIssuance } from "@/utils/blockchain/counterparty";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";

export function ComposeIssuanceLockSupply() {
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
        initialTitle="Lock Supply"
        FormComponent={(props) => <LockSupplyForm {...props} asset={asset} />}
        ReviewComponent={ReviewIssuanceLockSupply}
        composeApiMethod={composeIssuance}
      />
    </div>
  );
}

export default ComposeIssuanceLockSupply;
