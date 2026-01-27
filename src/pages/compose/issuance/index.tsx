import { useParams } from 'react-router-dom';
import { IssuanceForm } from "./form";
import { ReviewIssuance } from "./review";
import { Composer } from "@/components/composer";
import { composeIssuance } from "@/utils/blockchain/counterparty/compose";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeIssuancePage() {
  const { asset } = useParams<{ asset?: string }>();

  return (
    <div className="p-4">
      <Composer<IssuanceOptions>
        composeType="issuance"
        composeApiMethod={composeIssuance}
        initialTitle="Issue Asset"
        FormComponent={(props) => <IssuanceForm {...props} initialParentAsset={asset} />}
        ReviewComponent={ReviewIssuance}
      />
    </div>
  );
}

export default ComposeIssuancePage;
