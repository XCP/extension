import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { ErrorAlert } from "@/components/ui/error-alert";
import { IssueSupplyForm } from "@/pages/compose/issuance/issue-supply/form";
import { ReviewIssuanceIssueSupply } from "@/pages/compose/issuance/issue-supply/review";
import { composeIssuance } from "@/utils/blockchain/counterparty/compose";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty/compose";

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
