import React from 'react';
import { useParams } from 'react-router-dom';
import { Composer } from '@/components/composer';
import { composeOrder } from '@/utils/composer';
import { OrderForm } from './form';
import { ReviewOrder } from './review';

export function ComposeOrderPage() {
  const { asset: giveAssetParam } = useParams<{ asset?: string }>();
  const giveAsset = giveAssetParam ? decodeURIComponent(giveAssetParam) : '';

  return (
    <div className="p-4">
      <Composer
        initialTitle="Dex Order"
        FormComponent={(props) => <OrderForm {...props} giveAsset={giveAsset} />}
        ReviewComponent={(props) => <ReviewOrder {...props} giveAsset={giveAsset} />}
        composeTransaction={composeOrder}
      />
    </div>
  );
}

export default ComposeOrderPage;
