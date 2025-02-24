import { useParams } from 'react-router-dom';
import { IssuanceForm } from "./form";
import { ReviewIssuance } from "./review";
import { Composer } from "@/components/composer";
import { composeIssuance } from "@/utils/blockchain/counterparty";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";

export function ComposeIssuance() {
  const { asset } = useParams<{ asset?: string }>();

  return (
    <div className="p-4">
      <Composer<IssuanceOptions>
        initialTitle="Issue Asset"
        FormComponent={(props) => <IssuanceForm {...props} initialParentAsset={asset} />}
        ReviewComponent={ReviewIssuance}
        composeTransaction={composeIssuance}
      />
    </div>
  );
}

export default ComposeIssuance;
