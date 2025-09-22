import { DispenseForm } from "./form";
import { ReviewDispense } from "./review";
import { Composer } from "@/components/composer";
import { composeDispense } from "@/utils/blockchain/counterparty/compose";
import type { DispenseOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeDispense() {
  return (
    <div className="p-4">
      <Composer<DispenseOptions>
        composeType="dispense"
        composeApiMethod={composeDispense}
        initialTitle="Dispense"
        FormComponent={DispenseForm}
        ReviewComponent={ReviewDispense}
      />
    </div>
  );
}

export default ComposeDispense;
