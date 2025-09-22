import { useParams } from "react-router-dom";
import { UtxoDetachForm } from "./form";
import { ReviewUtxoDetach } from "./review";
import { Composer } from "@/components/composer";
import { composeDetach } from "@/utils/blockchain/counterparty/compose";
import type { DetachOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeUtxoDetach() {
  const { txid } = useParams<{ txid: string }>();

  return (
    <div className="p-4">
      <Composer<DetachOptions>
        initialTitle="Detach UTXO"
        FormComponent={(props) => <UtxoDetachForm {...props} initialUtxo={txid || ""} />}
        ReviewComponent={ReviewUtxoDetach}
        composeApiMethod={composeDetach}
      />
    </div>
  );
}

export default ComposeUtxoDetach;
