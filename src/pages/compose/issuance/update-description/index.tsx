import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { IssuanceOptions } from "@/core/counterparty/compose";
import { composeIssuance } from "@/core/counterparty/compose";
import { t } from '@/i18n';
import { UpdateDescriptionForm } from "@/pages/compose/issuance/update-description/form";
import { ReviewIssuanceUpdateDescription } from "@/pages/compose/issuance/update-description/review";

function ComposeUpdateDescriptionPage() {
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
        initialTitle={t('issuance_update_description_update_asset')}
        FormComponent={(props) => <UpdateDescriptionForm {...props} asset={asset} />}
        ReviewComponent={ReviewIssuanceUpdateDescription}
      />
    </div>
  );
}

export default ComposeUpdateDescriptionPage;
