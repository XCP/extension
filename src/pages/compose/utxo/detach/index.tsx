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
        composeType="detach"
        composeApiMethod={composeDetach}
        initialTitle="Detach UTXO"
        FormComponent={(props) => <UtxoDetachForm {...props} initialUtxo={txid || ""} />}
        ReviewComponent={ReviewUtxoDetach}
      />
    </div>
  );
}

export default ComposeUtxoDetach;
