import { useParams } from "react-router-dom";
import { Composer } from "@/components/composer";
import { ErrorAlert } from "@/components/error-alert";
import { TransferOwnershipForm } from "./form";
import { ReviewIssuanceTransferOwnership } from "./review";
import { composeIssuance } from "@/utils/blockchain/counterparty/compose";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeIssuanceTransferOwnership() {
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
        initialTitle="Transfer Asset"
        FormComponent={(props) => <TransferOwnershipForm {...props} asset={asset} />}
        ReviewComponent={ReviewIssuanceTransferOwnership}
      />
    </div>
  );
}

export default ComposeIssuanceTransferOwnership;
