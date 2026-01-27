import { useParams } from "react-router-dom";
import { FairmintForm } from "./form";
import { ReviewFairmint } from "./review";
import { Composer } from "@/components/composer";
import { composeFairmint } from "@/utils/blockchain/counterparty/compose";
import type { FairmintOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeFairmintPage() {
  const { asset } = useParams<{ asset?: string }>();

  return (
    <div className="p-4">
      <Composer<FairmintOptions>
        composeType="fairmint"
        composeApiMethod={composeFairmint}
        initialTitle="Fairmint"
        FormComponent={(props) => <FairmintForm {...props} asset={asset || ""} />}
        ReviewComponent={ReviewFairmint}
      />
    </div>
  );
}

export default ComposeFairmintPage;
