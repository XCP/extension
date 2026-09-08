import { Composer } from '@/components/composer/composer';
import type { BTCPayOptions } from '@/core/counterparty/compose';
import { composeBTCPay } from '@/core/counterparty/compose';
import { t } from '@/i18n';
import { BTCPayForm } from '@/pages/compose/order/btcpay/form';
import { ReviewBTCPay } from '@/pages/compose/order/btcpay/review';

function ComposeOrderBtcPayPage() {
  return (
    <div className="p-4">
      <Composer<BTCPayOptions>
        composeType="btcpay"
        composeApiMethod={composeBTCPay}
        initialTitle={t('order_btcpay_btcpay')}
        FormComponent={BTCPayForm}
        ReviewComponent={ReviewBTCPay}
      />
    </div>
  );
}

export default ComposeOrderBtcPayPage;
