import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import type { DestroyOptions } from "@/core/counterparty/compose";
import { composeDestroy } from "@/core/counterparty/compose";
import { DestroySupplyForm } from "@/pages/compose/issuance/destroy-supply/form";
import { ReviewDestroy } from "@/pages/compose/issuance/destroy-supply/review";

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
