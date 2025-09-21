import { WeeklyBetForm } from "./form";
import { WeeklyReviewBet } from "./review";
import { Composer } from "@/components/composer";
import { composeBet } from "@/utils/blockchain/counterparty";
import type { BetOptions } from "@/utils/blockchain/counterparty";

function ComposeWeeklyBet() {
  return (
    <div className="p-4">
      <Composer<BetOptions>
        initialTitle="Weekly Bet"
        FormComponent={WeeklyBetForm}
        ReviewComponent={WeeklyReviewBet}
        composeApiMethod={composeBet}
      />
    </div>
  );
}

export default ComposeWeeklyBet;
