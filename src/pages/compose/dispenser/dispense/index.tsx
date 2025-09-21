import { DispenseForm } from "./form";
import { ReviewDispense } from "./review";
import { Composer } from "@/components/composer";
import { composeDispense } from "@/utils/blockchain/counterparty";
import type { DispenseOptions } from "@/utils/blockchain/counterparty";

function ComposeDispense() {
  return (
    <div className="p-4">
      <Composer<DispenseOptions>
        initialTitle="Dispense"
        FormComponent={DispenseForm}
        ReviewComponent={ReviewDispense}
        composeApiMethod={composeDispense}
      />
    </div>
  );
}

export default ComposeDispense;
