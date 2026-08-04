import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import type { FairmintOptions } from "@/core/counterparty/compose";
import { composeFairmint } from "@/core/counterparty/compose";
import { FairmintForm } from "@/pages/compose/fairminter/fairmint/form";
import { ReviewFairmint } from "@/pages/compose/fairminter/fairmint/review";

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
