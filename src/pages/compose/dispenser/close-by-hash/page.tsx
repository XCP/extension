import { useParams } from 'react-router-dom';
import { DispenserCloseByHashForm } from "./form";
import { ReviewDispenserCloseByHash } from "./review";
import { Composer } from "@/components/composer";
import { composeDispenser } from "@/utils/blockchain/counterparty";
import type { DispenserOptions } from "@/utils/blockchain/counterparty";

export function ComposeDispenserCloseByHash() {
  const { tx_hash } = useParams<{ tx_hash?: string }>();

  return (
    <div className="p-4">
      <Composer<DispenserOptions>
        initialTitle="Close"
        FormComponent={(props) => <DispenserCloseByHashForm {...props} initialTxHash={tx_hash} />}
        ReviewComponent={ReviewDispenserCloseByHash}
        composeApiMethod={composeDispenser}
      />
    </div>
  );
}

export default ComposeDispenserCloseByHash;
