import { Composer } from "@/components/composer/composer";
import type { ApiResponse, MPMAOptions } from "@/core/counterparty/compose";
import { composeMPMA } from "@/core/counterparty/compose";
import { MPMAForm } from "@/pages/compose/send/mpma/form";
import { ReviewMPMA } from "@/pages/compose/send/mpma/review";

interface MPMAData {
  sourceAddress: string;
  assets: string;
  destinations: string;
  quantities: string;
  memos?: string;
  memos_are_hex?: string;
  sat_per_vbyte: number;
}

function ComposeMpmaPage() {
  const composeTransaction = async (data: MPMAData): Promise<ApiResponse> => {
    // Parse the comma-separated values. Quantities arrive in base units: normalizeFormData
    // resolves each asset's divisibility before compose, so that message verification can
    // rebuild the message from the same data the API receives (`pack/messages.ts`).
    const assets = data.assets.split(',');
    const destinations = data.destinations.split(',');
    const quantities = data.quantities.split(',');
    const memos = data.memos ? data.memos.split(',') : undefined;
    const memosAreHex = data.memos_are_hex ? data.memos_are_hex.split(',').map(v => v === 'true') : undefined;

    // The three lists are parallel by construction in the MPMA form; a
    // mismatch means corrupted form state and must not reach compose
    if (destinations.length !== assets.length || quantities.length !== assets.length) {
      throw new Error('Mismatched MPMA form data: assets, destinations, and quantities must align');
    }

    const mpmaOptions: MPMAOptions = {
      sourceAddress: data.sourceAddress,
      assets,
      destinations,
      quantities,
      sat_per_vbyte: data.sat_per_vbyte,
      ...(memos && { memos }),
      ...(memosAreHex && { memos_are_hex: memosAreHex })
    };

    return composeMPMA(mpmaOptions);
  };

  return (
    <div className="p-4">
      <Composer<MPMAData>
        composeType="mpma"
        composeApiMethod={composeTransaction}
        initialTitle="MPMA Send"
        FormComponent={MPMAForm}
        ReviewComponent={ReviewMPMA}
      />
    </div>
  );
}

export default ComposeMpmaPage;