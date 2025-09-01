import React from "react";
import { useParams } from "react-router-dom";
import { Composer } from "@/components/composer";
import { ResetSupplyForm } from "./form";
import { ReviewIssuanceResetSupply } from "./review";
import { composeIssuance } from "@/utils/blockchain/counterparty";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";

export function ComposeIssuanceResetSupply() {
  const { asset: assetParam } = useParams<{ asset?: string }>();
  const asset = assetParam ? decodeURIComponent(assetParam) : "";

  if (!asset) {
    return <div>Asset not specified.</div>;
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
