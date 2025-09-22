import { useParams } from "react-router-dom";
import { SweepForm } from "./form";
import { ReviewSweep } from "./review";
import { Composer } from "@/components/composer";
import { composeSweep } from "@/utils/blockchain/counterparty/compose";
import { useWallet } from "@/contexts/wallet-context";
import type { SweepOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeSweep() {
  const {} = useParams<{ address?: string }>();
  const {} = useWallet();
  

  return (
    <div className="p-4">
      <Composer<SweepOptions>
        composeType="sweep"
        composeApiMethod={composeSweep}
        initialTitle="Sweep"
        FormComponent={SweepForm}
        ReviewComponent={ReviewSweep}
      />
    </div>
  );
}

export default ComposeSweep;
