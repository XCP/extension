import { BetForm } from "./form";
import { ReviewBet } from "./review";
import { Composer } from "@/components/composer";
import { composeBet } from "@/utils/blockchain/counterparty/compose";
import type { BetOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeBet() {
  return (
    <div className="p-4">
      <Composer<BetOptions>
        composeType="bet"
        composeApiMethod={composeBet}
        initialTitle="Bet"
        FormComponent={BetForm}
        ReviewComponent={ReviewBet}
      />
    </div>
  );
}

export default ComposeBet;
