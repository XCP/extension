import React from 'react';
import { useParams } from 'react-router-dom';
import { Composer } from '@/components/composer';
import { composeFairminter } from '@/utils/composer';
import { FairminterForm } from './form';
import { ReviewFairminter } from './review';

export function ComposeFairminterPage() {
  const { asset } = useParams<{ asset?: string }>();
  // Pass the asset (if any) to the form for default values
  return (
    <div className="p-4">
      <Composer
        initialTitle="Fairminter"
        FormComponent={(props) => <FairminterForm {...props} asset={asset || ''} />}
        ReviewComponent={(props) => <ReviewFairminter {...props} />}
        composeTransaction={composeFairminter}
      />
    </div>
  );
}

export default ComposeFairminterPage;
