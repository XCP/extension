import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { IssuanceOptions } from "@/core/counterparty/compose";
import { composeIssuance } from "@/core/counterparty/compose";
import { t } from '@/i18n';
import { LockSupplyForm } from "@/pages/compose/issuance/lock-supply/form";
import { ReviewIssuanceLockSupply } from "@/pages/compose/issuance/lock-supply/review";

function ComposeLockSupplyPage() {
  const { asset } = useParams<{ asset?: string }>();

  if (!asset) {
    return (
      <div className="p-4">
        <ErrorAlert message={t('common_asset_parameter_is_required')} />
      </div>
    );
  }

  return (
    <div className="p-4">
      <Composer<IssuanceOptions>
        composeType="issuance"
        composeApiMethod={composeIssuance}
        initialTitle={t('common_lock_supply')}
        renderForm={(props) => <LockSupplyForm {...props} asset={asset} />}
        ReviewComponent={ReviewIssuanceLockSupply}
      />
    </div>
  );
}

export default ComposeLockSupplyPage;
