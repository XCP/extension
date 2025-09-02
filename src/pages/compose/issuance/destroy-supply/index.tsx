import { useParams } from "react-router-dom";
import { DestroySupplyForm } from "./form";
import { ReviewDestroy } from "./review";
import { Composer } from "@/components/composer";
import { composeDestroy } from "@/utils/blockchain/counterparty";
import type { DestroyOptions } from "@/utils/blockchain/counterparty";

export function ComposeDestroy() {
  const { asset } = useParams<{ asset?: string }>();

  return (
    <div className="p-4">
      <Composer<DestroyOptions>
        initialTitle="Destroy"
        FormComponent={(props) => (
          <DestroySupplyForm
            {...props}
            initialAsset={asset || ""}
          />
        )}
        ReviewComponent={ReviewDestroy}
        composeApiMethod={composeDestroy}
      />
    </div>
  );
}

export default ComposeDestroy;
