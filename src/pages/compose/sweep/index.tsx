import { Composer } from "@/components/composer/composer";
import type { SweepOptions } from "@/core/counterparty/compose";
import { composeSweep } from "@/core/counterparty/compose";
import { t } from '@/i18n';
import { SweepForm } from "@/pages/compose/sweep/form";
import { ReviewSweep } from "@/pages/compose/sweep/review";

function ComposeSweepPage() {
  return (
    <div className="p-4">
      <Composer<SweepOptions>
        composeType="sweep"
        composeApiMethod={composeSweep}
        initialTitle={t('common_sweep')}
        FormComponent={SweepForm}
        ReviewComponent={ReviewSweep}
      />
    </div>
  );
}

export default ComposeSweepPage;
