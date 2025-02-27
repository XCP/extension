"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Label, Input, Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Button } from "@/components/button";
import { BalanceHeader } from "@/components/headers/balance-header";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { formatAmount } from "@/utils/format";
import type { ReactElement } from "react";

// Hardcoded feed address for weekly market bets
const WEEKLY_FEED_ADDRESS = "WEEKLY_MARKET_FEED_ADDRESS";

// Market open time: Monday 9:30 AM EST
const getNextMondayOpen = (): Date => {
  const now = new Date();
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7));
  nextMonday.setUTCHours(14, 30, 0, 0); // 9:30 AM EST = 14:30 UTC
  return nextMonday;
};

// Check if current time is within betting window (Saturday 00:00 UTC to Monday 14:30 UTC)
const isBettingWindowOpen = (): boolean => {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  return (day === 6) || (day === 0) || (day === 1 && (hours < 14 || (hours === 14 && minutes < 30)));
};

// Mock API response (hardcoded as if from an API)
const mockApiResponse = {
  markets: [
    {
      id: "sp500",
      name: "S&P 500",
      question: "Will the S&P 500 close higher this week than last?",
      yesOdds: 0.40, // Trailing 10-week odds: 40% Yes
      noOdds: 0.60,
    },
    {
      id: "gold",
      name: "Gold",
      question: "Will the gold price close higher this week than last?",
      yesOdds: 0.50, // Example: 50% Yes
      noOdds: 0.50,
    },
    {
      id: "bitcoin",
      name: "Bitcoin",
      question: "Will the Bitcoin price close higher this week than last?",
      yesOdds: 0.70, // Example: 70% Yes
      noOdds: 0.30,
    },
  ],
};

interface BetFormProps {
  formAction: (formData: FormData) => void;
}

interface BetChoice {
  id: number;
  name: string;
  bet_type: number; // 2 = Equal, 3 = NotEqual
}

interface Market {
  id: string;
  name: string;
  question: string;
  yesOdds: number;
  noOdds: number;
}

export function WeeklyBetForm({ formAction }: BetFormProps): ReactElement {
  const { error: assetError, data: assetDetails } = useAssetDetails("XCP");
  const { pending } = useFormStatus();
  const [selectedChoice, setSelectedChoice] = useState<BetChoice>({
    id: 1,
    name: "Yes",
    bet_type: 2,
  });
  const [wagerAmount, setWagerAmount] = useState<string>("");
  const [isWindowOpen, setIsWindowOpen] = useState<boolean>(isBettingWindowOpen());
  const [selectedMarket, setSelectedMarket] = useState<Market>(mockApiResponse.markets[0]);
  const [markets] = useState<Market[]>(mockApiResponse.markets); // Mock API data

  // Comment out a sample API call (for future integration)
  /*
  const [markets, setMarkets] = useState<Market[]>([]);
  useEffect(() => {
    const fetchOdds = async () => {
      try {
        const response = await fetch("/api/market-odds");
        const data = await response.json();
        setMarkets(data.markets);
        setSelectedMarket(data.markets[0]); // Default to first market
      } catch (error) {
        console.error("Failed to fetch market odds:", error);
      }
    };
    fetchOdds();
  }, []);
  */

  // Odds and fee constants based on selected market
  const YES_ODDS = selectedMarket.yesOdds;
  const NO_ODDS = selectedMarket.noOdds;
  const YES_TO_NO_RATIO = YES_ODDS / NO_ODDS;
  const NO_TO_YES_RATIO = NO_ODDS / YES_ODDS;
  const FEE_FRACTION = 0.05; // 5%, set via broadcast as 5000000

  // Bet choices
  const betChoices: BetChoice[] = [
    { id: 1, name: "Yes", bet_type: 2 },
    { id: 2, name: "No", bet_type: 3 },
  ];

  // Calculate counterwager based on selected choice and market odds
  const calculateCounterwager = (wager: number, choice: BetChoice): number => {
    return choice.name === "Yes" ? wager * YES_TO_NO_RATIO : wager * NO_TO_YES_RATIO;
  };

  const wagerFloat = parseFloat(wagerAmount) || 0;
  const counterwager = formatAmount({
    value: calculateCounterwager(wagerFloat, selectedChoice),
    maximumFractionDigits: 4,
    minimumFractionDigits: 4
  }); // Round to 4 decimals
  const totalPot = wagerFloat + parseFloat(counterwager);
  const feeAmount = formatAmount({
    value: totalPot * FEE_FRACTION,
    maximumFractionDigits: 8,
    minimumFractionDigits: 8
  });
  const payout = formatAmount({
    value: totalPot - parseFloat(feeAmount),
    maximumFractionDigits: 8,
    minimumFractionDigits: 8
  });

  // Update betting window status every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setIsWindowOpen(isBettingWindowOpen());
    }, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const enhancedFormAction = (formData: FormData) => {
    const processedFormData = new FormData();
    if (isNaN(wagerFloat) || wagerFloat <= 0) {
      alert("Please enter a valid wager amount.");
      return;
    }

    // Convert to satoshis (XCP is divisible, 1 XCP = 10^8 satoshis)
    const wagerSatoshis = Math.round(wagerFloat * 1e8);
    const counterwagerSatoshis = Math.round(calculateCounterwager(wagerFloat, selectedChoice) * 1e8);

    // Preset parameters
    processedFormData.append("feed_address", WEEKLY_FEED_ADDRESS);
    processedFormData.append("bet_type", selectedChoice.bet_type.toString());
    processedFormData.append("deadline", Math.floor(getNextMondayOpen().getTime() / 1000).toString());
    processedFormData.append("wager_quantity", wagerSatoshis.toString());
    processedFormData.append("counterwager_quantity", counterwagerSatoshis.toString());
    processedFormData.append("target_value", "1"); // Always 1
    processedFormData.append("leverage", "5040"); // 1x leverage
    processedFormData.append("expiration", "10080"); // ~1 week in blocks
    processedFormData.append("sat_per_vbyte", "1"); // Default fee rate

    formAction(processedFormData);
  };

  return (
    <div className="space-y-4">
      {assetError ? (
        <div className="text-red-500 mb-4">{assetError.message}</div>
      ) : assetDetails ? (
        <BalanceHeader
          balance={{
            asset: "XCP",
            quantity_normalized: assetDetails.availableBalance,
            asset_info: assetDetails.assetInfo || undefined,
          }}
          className="mt-1 mb-5"
        />
      ) : null}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <form action={enhancedFormAction} className="space-y-6">
          <div className="text-center">
            <h2 className="text-lg font-medium text-gray-900">{selectedMarket.question}</h2>
            <p className="text-sm text-gray-500">
              Betting open: Saturday 00:00 UTC - Monday 14:30 UTC
            </p>
            <p className="text-sm text-gray-500">
              Deadline: {getNextMondayOpen().toLocaleString()}
            </p>
          </div>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Select Market <span className="text-red-500">*</span>
            </Label>
            <div className="mt-1">
              <Listbox value={selectedMarket} onChange={setSelectedMarket} disabled={pending || !isWindowOpen}>
                <ListboxButton
                  className="w-full p-2 text-left rounded-md border border-gray-200 bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
                >
                  <span>{selectedMarket.name}</span>
                </ListboxButton>
                <ListboxOptions className="w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto z-10">
                  {markets.map((market) => (
                    <ListboxOption
                      key={market.id}
                      value={market}
                      className="p-2 cursor-pointer hover:bg-gray-100"
                    >
                      {({ selected }) => (
                        <div className="flex justify-between">
                          <span className={selected ? "font-medium" : ""}>{market.name}</span>
                        </div>
                      )}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </Listbox>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Odds (Trailing 10 weeks): {Math.round(YES_ODDS * 100)}% Yes, {Math.round(NO_ODDS * 100)}% No | 5% feed fee applies
            </p>
          </Field>

          {!isWindowOpen && (
            <div className="text-red-500 text-center">
              Betting is currently closed. Please wait until the weekend.
            </div>
          )}

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Your Prediction <span className="text-red-500">*</span>
            </Label>
            <div className="mt-1">
              <Listbox value={selectedChoice} onChange={setSelectedChoice} disabled={pending || !isWindowOpen}>
                <ListboxButton
                  className="w-full p-2 text-left rounded-md border border-gray-200 bg-gray-50 focus:border-blue-500 focus:ring-blue-500"
                >
                  <span>{selectedChoice.name}</span>
                </ListboxButton>
                <ListboxOptions className="w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto z-10">
                  {betChoices.map((choice) => (
                    <ListboxOption
                      key={choice.id}
                      value={choice}
                      className="p-2 cursor-pointer hover:bg-gray-100"
                    >
                      {({ selected }) => (
                        <div className="flex justify-between">
                          <span className={selected ? "font-medium" : ""}>{choice.name}</span>
                        </div>
                      )}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </Listbox>
            </div>
          </Field>

          <Field>
            <Label className="text-sm font-medium text-gray-700">
              Wager Amount (XCP) <span className="text-red-500">*</span>
            </Label>
            <Input
              type="number"
              name="wager_amount"
              value={wagerAmount}
              onChange={(e) => setWagerAmount(e.target.value)}
              required
              min="0.00000001"
              step="0.00000001"
              placeholder="Enter XCP amount"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
              disabled={pending || !isWindowOpen}
            />
            <p className="mt-2 text-sm text-gray-500">
              {wagerAmount && !isNaN(wagerFloat) ? (
                <>
                  Counterwager: {counterwager} XCP (required from {selectedChoice.name === "Yes" ? "No" : "Yes"} bettor)
                  <br />
                  Total pot: {formatAmount({
                    value: totalPot,
                    maximumFractionDigits: 8,
                    minimumFractionDigits: 8
                  })} XCP | Feed fee: {feeAmount} XCP | Payout: {payout} XCP
                </>
              ) : ""}
            </p>
          </Field>

          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={pending || !isWindowOpen}
          >
            {pending ? "Submitting..." : "Place Bet"}
          </Button>
        </form>
      </div>
    </div>
  );
}
