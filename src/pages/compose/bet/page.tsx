import { BetForm } from "./form";
import { ReviewBet } from "./review";
import { Composer } from "@/components/composer";
import { composeBet } from "@/utils/blockchain/counterparty";
import type { BetOptions } from "@/utils/blockchain/counterparty";

export function ComposeBet() {
  return (
    <div className="p-4">
      <Composer<BetOptions>
        initialTitle="Bet"
        FormComponent={BetForm}
        ReviewComponent={ReviewBet}
        composeTransaction={composeBet}
      />
    </div>
  );
}

export default ComposeBet;
