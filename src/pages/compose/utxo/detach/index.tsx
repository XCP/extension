import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import type { DetachOptions } from "@/core/counterparty/compose";
import { composeDetach } from "@/core/counterparty/compose";
import { UtxoDetachForm } from "@/pages/compose/utxo/detach/form";
import { ReviewUtxoDetach } from "@/pages/compose/utxo/detach/review";

function ComposeUtxoDetachPage() {
  const { txId } = useParams<{ txId: string }>();

  return (
    <div className="p-4">
      <Composer<DetachOptions>
        composeType="detach"
        composeApiMethod={composeDetach}
        initialTitle="Detach UTXO"
        FormComponent={(props) => <UtxoDetachForm {...props} initialUtxo={txId || ""} />}
        ReviewComponent={ReviewUtxoDetach}
      />
    </div>
  );
}

export default ComposeUtxoDetachPage;
