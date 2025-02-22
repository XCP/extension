import { useParams } from "react-router-dom";
import { UtxoAttachForm } from "./form";
import { ReviewUtxoAttach } from "./review";
import { Composer } from "@/components/composer";
import { composeAttach } from "@/utils/blockchain/counterparty";

export function ComposeUtxoAttach() {
  const { asset } = useParams<{ asset: string }>();

  return (
    <div className="p-4">
      <Composer
        initialTitle="Attach"
        FormComponent={(props) => <UtxoAttachForm {...props} initialAsset={asset || ""} />}
        ReviewComponent={ReviewUtxoAttach}
        composeTransaction={composeAttach}
      />
    </div>
  );
}

export default ComposeUtxoAttach;
