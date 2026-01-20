import { MPMAForm } from "./form";
import { ReviewMPMA } from "./review";
import { Composer } from "@/components/composer";
import { composeMPMA } from "@/utils/blockchain/counterparty/compose";
import { fetchAssetDetails } from "@/utils/blockchain/counterparty/api";
import { toSatoshis } from "@/utils/numeric";
import type { MPMAOptions, ApiResponse } from "@/utils/blockchain/counterparty/compose";

interface MPMAData {
  sourceAddress: string;
  assets: string;
  destinations: string;
  quantities: string;
  memos?: string;
  memos_are_hex?: string;
  sat_per_vbyte: number;
}

function ComposeMPMA() {
  const composeTransaction = async (data: MPMAData): Promise<ApiResponse> => {
    // Parse the comma-separated values
    const assets = data.assets.split(',');
    const destinations = data.destinations.split(',');
    const quantities = data.quantities.split(',');
    const memos = data.memos ? data.memos.split(',') : undefined;
    const memosAreHex = data.memos_are_hex ? data.memos_are_hex.split(',').map(v => v === 'true') : undefined;

    // Build divisibility cache: fetch unique assets in parallel
    const knownDivisible: Record<string, boolean> = { BTC: true, XCP: true };
    const uniqueAssets = [...new Set(assets)].filter(a => !(a in knownDivisible));

    const assetInfos = await Promise.all(
      uniqueAssets.map(async (asset) => {
        try {
          const info = await fetchAssetDetails(asset);
          return { asset, divisible: info?.divisible ?? false };
        } catch {
          return { asset, divisible: false };
        }
      })
    );

    const divisibilityCache: Record<string, boolean> = {
      ...knownDivisible,
      ...Object.fromEntries(assetInfos.map(({ asset, divisible }) => [asset, divisible]))
    };

    // Normalize quantities based on divisibility
    const normalizedQuantities = assets.map((asset, i) => {
      const isDivisible = divisibilityCache[asset];
      return isDivisible ? toSatoshis(quantities[i]) : quantities[i];
    });

    // Create MPMA options with normalized quantities
    const mpmaOptions: MPMAOptions = {
      sourceAddress: data.sourceAddress,
      assets,
      destinations,
      quantities: normalizedQuantities,
      sat_per_vbyte: data.sat_per_vbyte,
      ...(memos && { memos }),
      ...(memosAreHex && { memos_are_hex: memosAreHex })
    };

    // Compose MPMA transaction
    const response = await composeMPMA(mpmaOptions);
    return response;
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

export default ComposeMPMA;