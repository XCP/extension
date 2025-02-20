import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { DispenserCloseForm } from "./form";
import { ReviewDispenserClose } from "./review";
import { Composer } from "@/components/composer";
import { composeDispenser, fetchAddressDispensers } from "@/utils/blockchain/counterparty";
import { useWallet } from "@/contexts/wallet-context";

export function ComposeDispenserClosePage() {
  const { asset: assetParam } = useParams<{ asset?: string }>();
  const { walletState } = useWallet();
  const asset = assetParam ? decodeURIComponent(assetParam) : "";

  // Fetch dispensers for the current wallet address
  const [dispensers, setDispensers] = useState<any[]>([]);
  const [totalDispensers, setTotalDispensers] = useState<number>(0);

  useEffect(() => {
    async function loadDispensers() {
      if (!walletState?.address) return;
      try {
        const { dispensers: fetchedDispensers, total } = await fetchAddressDispensers(
          walletState.address,
          { status: "open", verbose: true }
        );
        setDispensers(fetchedDispensers);
        setTotalDispensers(total);
      } catch (err) {
        console.error("Failed to load dispensers:", err);
      }
    }
    loadDispensers();
  }, [walletState?.address]);

  return (
    <div className="p-4">
      <Composer
        initialTitle="Close Dispenser"
        FormComponent={(props) => (
          <DispenserCloseForm
            {...props}
            asset={asset}
            dispensers={dispensers}
            totalDispensers={totalDispensers}
          />
        )}
        ReviewComponent={(props) => <ReviewDispenserClose {...props} />}
        composeTransaction={composeDispenser}
      />
    </div>
  );
}

export default ComposeDispenserClosePage;
