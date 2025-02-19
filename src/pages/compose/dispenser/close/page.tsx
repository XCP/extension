import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Composer } from "@/components/composer";
import { composeDispenser } from "@/utils/composer";
import { fetchAddressDispensers } from "@/utils/counterparty";
import { DispenserCloseForm } from "./form";
import { ReviewDispenserClose } from "./review";

export function ComposeDispenserClosePage() {
  const { asset: assetParam } = useParams<{ asset?: string }>();
  const asset = assetParam ? decodeURIComponent(assetParam) : "";

  // Fetch dispensers for the current wallet address
  const [dispensers, setDispensers] = useState<any[]>([]);
  const [totalDispensers, setTotalDispensers] = useState<number>(0);

  useEffect(() => {
    async function loadDispensers() {
      // Replace with your wallet context value
      const walletAddress = "YOUR_WALLET_ADDRESS"; // or get it from your wallet context
      if (!walletAddress) return;
      try {
        const { dispensers: fetchedDispensers, total } = await fetchAddressDispensers(
          walletAddress,
          { status: "open", verbose: true }
        );
        setDispensers(fetchedDispensers);
        setTotalDispensers(total);
      } catch (err) {
        console.error("Failed to load dispensers:", err);
      }
    }
    loadDispensers();
  }, []);

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
