import { useParams } from "react-router-dom";
import { Composer } from "@/components/composer";
import { ErrorAlert } from "@/components/error-alert";
import { IssueSupplyForm } from "./form";
import { ReviewIssuanceIssueSupply } from "./review";
import { composeIssuance } from "@/utils/blockchain/counterparty";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";

export function ComposeIssuanceIssueSupply() {
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
        initialTitle="Issue Additional Supply"
        FormComponent={(props) => <IssueSupplyForm {...props} initialParentAsset={asset} />}
        ReviewComponent={ReviewIssuanceIssueSupply}
        composeApiMethod={composeIssuance}
      />
    </div>
  );
}

export default ComposeIssuanceIssueSupply;
