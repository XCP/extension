import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { FairminterForm } from "@/pages/compose/fairminter/form";
import { ReviewFairminter } from "@/pages/compose/fairminter/review";
import type { FairminterOptions } from "@/utils/blockchain/counterparty/compose";
import { composeFairminter } from "@/utils/blockchain/counterparty/compose";

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
