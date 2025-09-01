import { useParams } from 'react-router-dom';
import { OrderForm } from './form';
import { ReviewOrder } from './review';
import { Composer } from '@/components/composer';
import { composeOrder } from '@/utils/blockchain/counterparty';
import type { OrderOptions } from '@/utils/blockchain/counterparty';

export function ComposeOrderPage() {
  const { asset: giveAssetParam } = useParams<{ asset?: string }>();
  const giveAsset = giveAssetParam ? decodeURIComponent(giveAssetParam) : '';

  return (
    <div className="p-4">
      <Composer<OrderOptions>
        initialTitle="Dex Order"
        FormComponent={(props) => <OrderForm {...props} giveAsset={giveAsset} />}
        ReviewComponent={ReviewOrder}
        composeApi={composeOrder}
      />
    </div>
  );
}

export default ComposeOrderPage;
