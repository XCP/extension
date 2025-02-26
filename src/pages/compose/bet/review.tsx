import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

/**
 * Props for the ReviewBet component.
 */
interface ReviewBetProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for betting transactions.
 * @param {ReviewBetProps} props - Component props
 * @returns {ReactElement} Review UI for bet transaction
 */
export function ReviewBet({ apiResponse, onSign, onBack, error, isSigning }: ReviewBetProps) {
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

  // Format the deadline timestamp as a readable date
  const formatDeadline = (timestamp: string) => {
    const date = new Date(parseInt(timestamp) * 1000);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const customFields = [
    { label: "Feed Address", value: result.params.feed_address },
    {
      label: "Bet Type",
      value: betTypeMapping[result.params.bet_type] || result.params.bet_type,
    },
    { 
      label: "Deadline", 
      value: formatDeadline(result.params.deadline)
    },
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
      isSigning={isSigning}
    />
  );
}
