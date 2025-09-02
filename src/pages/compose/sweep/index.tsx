import { useParams } from "react-router-dom";
import { SweepForm } from "./form";
import { ReviewSweep } from "./review";
import { Composer } from "@/components/composer";
import { composeSweep } from "@/utils/blockchain/counterparty";
import { useWallet } from "@/contexts/wallet-context";
import type { SweepOptions } from "@/utils/blockchain/counterparty";

export function ComposeSweep() {
  const { address } = useParams<{ address?: string }>();
  const { activeAddress } = useWallet();
  
  const initialAddress = address || activeAddress?.address;

  return (
    <div className="p-4">
      <Composer<SweepOptions>
        initialTitle="Sweep"
        FormComponent={SweepForm}
        ReviewComponent={ReviewSweep}
        composeApiMethod={composeSweep}
      />
    </div>
  );
}

export default ComposeSweep;
