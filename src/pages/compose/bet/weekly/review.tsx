import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAssetQuantity } from "@/utils/format";

/**
 * Props for the WeeklyReviewBet component.
 */
interface WeeklyReviewBetProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for weekly bet transactions.
 * @param {WeeklyReviewBetProps} props - Component props
 * @returns {ReactElement} Review UI for weekly bet transaction
 */
export function WeeklyReviewBet({ apiResponse, onSign, onBack, error, isSigning }: WeeklyReviewBetProps) {
  const { result } = apiResponse;


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
      value: `${formatAssetQuantity(Number(result.params.wager_quantity), true)} XCP`,
    },
    {
      label: "Counterwager Quantity",
      value: `${formatAssetQuantity(Number(result.params.counterwager_quantity), true)} XCP`,
    },
    { label: "Expiration (Blocks)", value: result.params.expiration },
    { label: "Leverage", value: result.params.leverage },
    ...(result.params.target_value
      ? [{ label: "Target Value", value: result.params.target_value }]
      : []),
    ...(result.params.market_id
      ? [{ label: "Market", value: result.params.market_id }]
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
