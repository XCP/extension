import { useParams } from "react-router-dom";
import { DestroyForm } from "./form";
import { ReviewDestroy } from "./review";
import { Composer } from "@/components/composer";
import { composeDestroy } from "@/utils/blockchain/counterparty";

export function ComposeDestroy() {
  const { asset } = useParams<{ asset: string }>();

  return (
    <div className="p-4">
      <Composer
        initialTitle="Destroy"
        FormComponent={(props) => (
          <DestroyForm
            {...props}
            initialAsset={asset || ""}
          />
        )}
        ReviewComponent={ReviewDestroy}
        composeTransaction={composeDestroy}
      />
    </div>
  );
}

export default ComposeDestroy;
