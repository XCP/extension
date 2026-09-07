import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import type { DispenserOptions } from "@/core/counterparty/compose";
import { composeDispenser } from "@/core/counterparty/compose";
import { t } from '@/i18n';
import { DispenserCloseForm } from "@/pages/compose/dispenser/close/form";
import { ReviewDispenserClose } from "@/pages/compose/dispenser/close/review";

function ComposeDispenserClosePage() {
  const { asset } = useParams<{ asset?: string }>();

  return (
    <div className="p-4">
      <Composer<DispenserOptions>
        composeType="dispenser"
        composeApiMethod={composeDispenser}
        initialTitle={t('common_close')}
        FormComponent={(props) => <DispenserCloseForm {...props} initialAsset={asset} />}
        ReviewComponent={ReviewDispenserClose}
      />
    </div>
  );
}

export default ComposeDispenserClosePage;
