import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { IssuanceOptions } from "@/core/blockchain/counterparty/compose";
import { composeIssuance } from "@/core/blockchain/counterparty/compose";
import { IssueSupplyForm } from "@/pages/compose/issuance/issue-supply/form";
import { ReviewIssuanceIssueSupply } from "@/pages/compose/issuance/issue-supply/review";

function ComposeIssueSupplyPage() {
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
        initialTitle="Issue Supply"
        FormComponent={(props) => <IssueSupplyForm {...props} initialParentAsset={asset} />}
        ReviewComponent={ReviewIssuanceIssueSupply}
      />
    </div>
  );
}

export default ComposeIssueSupplyPage;
