import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

interface ReviewBetProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function ReviewBet({ apiResponse, onSign, onBack, error, setError }: ReviewBetProps) {
  const { result } = apiResponse;

  const formatQuantity = (quantity: number) =>
    formatAmount({
      value: quantity / 1e8,
      minimumFractionDigits: 8,
      maximumFractionDigits: 8,
    });

  const betTypeMapping: { [key: string]: string } = {
    "0": "Bullish CFD (deprecated)",
    "1": "Bearish CFD (deprecated)",
    "2": "Equal",
    "3": "NotEqual",
  };

  const customFields = [
    { label: "Feed Address", value: result.params.feed_address },
    {
      label: "Bet Type",
      value: betTypeMapping[result.params.bet_type] || result.params.bet_type,
    },
    { label: "Deadline", value: result.params.deadline },
    {
      label: "Wager Quantity",
      value: `${formatQuantity(Number(result.params.wager_quantity))} XCP`,
    },
    {
      label: "Counterwager Quantity",
      value: `${formatQuantity(Number(result.params.counterwager_quantity))} XCP`,
    },
    { label: "Expiration (Blocks)", value: result.params.expiration },
    { label: "Leverage", value: result.params.leverage },
    ...(result.params.target_value
      ? [{ label: "Target Value", value: result.params.target_value }]
      : []),
  ];

  return (
    <ReviewScreen
      apiResponse={apiResponse}
      onSign={onSign}
      onBack={onBack}
      customFields={customFields}
      error={error}
      setError={setError}
    />
  );
}
