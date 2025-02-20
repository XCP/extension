import { useParams } from "react-router-dom";
import { AttachForm } from "./form";
import { ReviewAttach } from "./review";
import { Composer } from "@/components/composer";
import { composeAttach } from "@/utils/blockchain/counterparty";

export function ComposeUtxoAttach() {
  const { asset } = useParams<{ asset: string }>();

  return (
    <div className="p-4">
      <Composer
        initialTitle="Attach"
        FormComponent={(props) => <AttachForm {...props} initialAsset={asset || ""} />}
        ReviewComponent={ReviewAttach}
        composeTransaction={composeAttach}
      />
    </div>
  );
}

export default ComposeUtxoAttach;
