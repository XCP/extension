import { useParams } from "react-router-dom";
import { DestroySupplyForm } from "./form";
import { ReviewDestroy } from "./review";
import { Composer } from "@/components/composer/composer";
import { composeDestroy } from "@/utils/blockchain/counterparty/compose";
import type { DestroyOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeDestroySupplyPage() {
  const { asset } = useParams<{ asset?: string }>();

  return (
    <div className="p-4">
      <Composer<DestroyOptions>
        composeType="destroy"
        composeApiMethod={composeDestroy}
        initialTitle="Destroy"
        FormComponent={(props) => (
          <DestroySupplyForm
            {...props}
            initialAsset={asset || ""}
          />
        )}
        ReviewComponent={ReviewDestroy}
      />
    </div>
  );
}

export default ComposeDestroySupplyPage;
