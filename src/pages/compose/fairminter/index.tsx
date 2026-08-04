import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import type { FairminterOptions } from "@/core/counterparty/compose";
import { composeFairminter } from "@/core/counterparty/compose";
import { FairminterForm } from "@/pages/compose/fairminter/form";
import { ReviewFairminter } from "@/pages/compose/fairminter/review";

function ComposeFairminterPage() {
  const { asset } = useParams<{ asset?: string }>();
  
  return (
    <div className="p-4">
      <Composer<FairminterOptions>
        composeType="fairminter"
        composeApiMethod={composeFairminter}
        initialTitle="Fairminter"
        FormComponent={(props) => <FairminterForm {...props} asset={asset || ''} />}
        ReviewComponent={ReviewFairminter}
      />
    </div>
  );
}

export default ComposeFairminterPage;
