import { Composer } from '@/components/composer/composer';
import type { BTCPayOptions } from '@/core/blockchain/counterparty/compose';
import { composeBTCPay } from '@/core/blockchain/counterparty/compose';
import { BTCPayForm } from '@/pages/compose/order/btcpay/form';
import { ReviewBTCPay } from '@/pages/compose/order/btcpay/review';

function ComposeOrderBtcPayPage() {
  return (
    <div className="p-4">
      <Composer<BTCPayOptions>
        composeType="btcpay"
        composeApiMethod={composeBTCPay}
        initialTitle="BTCPay"
        FormComponent={BTCPayForm}
        ReviewComponent={ReviewBTCPay}
      />
    </div>
  );
}

export default ComposeOrderBtcPayPage;
