import { useParams } from 'react-router-dom';
import { CancelForm } from "./form";
import { ReviewCancel } from "./review";
import { Composer } from "@/components/composer";
import { composeCancel } from "@/utils/blockchain/counterparty";
import type { CancelOptions } from "@/utils/blockchain/counterparty";

export function ComposeCancel() {
  const { hash } = useParams<{ hash?: string }>();

  return (
    <div className="p-4">
      <Composer<CancelOptions>
        initialTitle="Cancel"
        FormComponent={(props) => <CancelForm {...props} initialHash={hash} />}
        ReviewComponent={ReviewCancel}
        composeApiMethod={composeCancel}
      />
    </div>
  );
}

export default ComposeCancel;
