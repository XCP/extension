import { useParams } from "react-router-dom";
import { Composer } from "@/components/composer";
import { IssueSupplyForm } from "./form";
import { ReviewIssuanceIssueSupply } from "./review";
import { composeIssuance } from "@/utils/blockchain/counterparty";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";

export function ComposeIssuanceIssueSupply() {
  const { asset: assetParam } = useParams<{ asset?: string }>();
  const asset = assetParam ? decodeURIComponent(assetParam) : "";

  if (!asset) {
    return <div>Asset not specified.</div>;
  }

  return (
    <div className="p-4">
      <Composer<IssuanceOptions>
        initialTitle="Issue Additional Supply"
        FormComponent={IssueSupplyForm}
        ReviewComponent={ReviewIssuanceIssueSupply}
        composeApi={composeIssuance}
      />
    </div>
  );
}

export default ComposeIssuanceIssueSupply;
