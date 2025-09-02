import { useParams } from "react-router-dom";
import { FairmintForm } from "./form";
import { ReviewFairmint } from "./review";
import { Composer } from "@/components/composer";
import { composeFairmint } from "@/utils/blockchain/counterparty";
import type { FairmintOptions } from "@/utils/blockchain/counterparty";

export function ComposeFairmint() {
  const { asset } = useParams<{ asset?: string }>();

  return (
    <div className="p-4">
      <Composer<FairmintOptions>
        initialTitle="Fairmint"
        FormComponent={(props) => <FairmintForm {...props} initialAsset={asset || ""} />}
        ReviewComponent={ReviewFairmint}
        composeApiMethod={composeFairmint}
      />
    </div>
  );
}

export default ComposeFairmint;
