import { useParams } from 'react-router-dom';
import { DispenserCloseByHashForm } from "./form";
import { ReviewDispenserCloseByHash } from "./review";
import { Composer } from "@/components/composer";
import { composeDispenser } from "@/utils/blockchain/counterparty/compose";
import type { DispenserOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeDispenserCloseByHash() {
  const { tx_hash } = useParams<{ tx_hash?: string }>();

  return (
    <div className="p-4">
      <Composer<DispenserOptions>
        composeType="dispenser"
        composeApiMethod={composeDispenser}
        initialTitle="Close"
        FormComponent={(props) => <DispenserCloseByHashForm {...props} initialTxHash={tx_hash} />}
        ReviewComponent={ReviewDispenserCloseByHash}
      />
    </div>
  );
}

export default ComposeDispenserCloseByHash;
