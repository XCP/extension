import { useParams } from "react-router-dom";
import { Composer } from "@/components/composer";
import { TransferOwnershipForm } from "./form";
import { ReviewIssuanceTransferOwnership } from "./review";
import { composeIssuance } from "@/utils/blockchain/counterparty";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";

export function ComposeIssuanceTransferOwnership() {
  const { asset: assetParam } = useParams<{ asset?: string }>();
  const asset = assetParam ? decodeURIComponent(assetParam) : "";

  if (!asset) {
    return <div>Asset not specified.</div>;
  }

  return (
    <div className="p-4">
      <Composer<IssuanceOptions>
        initialTitle="Transfer Asset"
        FormComponent={(props) => <TransferOwnershipForm {...props} asset={asset} />}
        ReviewComponent={ReviewIssuanceTransferOwnership}
        composeTransaction={composeIssuance}
      />
    </div>
  );
}

export default ComposeIssuanceTransferOwnership;
