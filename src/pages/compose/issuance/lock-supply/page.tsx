import React from "react";
import { useParams } from "react-router-dom";
import { Composer } from "@/components/composer";
import { LockSupplyForm } from "./form";
import { ReviewIssuanceLockSupply } from "./review";
import { composeIssuance } from "@/utils/blockchain/counterparty";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";

export function ComposeIssuanceLockSupply() {
  const { asset: assetParam } = useParams<{ asset?: string }>();
  const asset = assetParam ? decodeURIComponent(assetParam) : "";

  if (!asset) {
    return <div>Asset not specified.</div>;
  }

  return (
    <div className="p-4">
      <Composer<IssuanceOptions>
        initialTitle="Lock Supply"
        FormComponent={(props) => <LockSupplyForm {...props} asset={asset} />}
        ReviewComponent={ReviewIssuanceLockSupply}
        composeApi={composeIssuance}
      />
    </div>
  );
}

export default ComposeIssuanceLockSupply;
