import { formatAddress, formatAmount } from "@/utils/format";

export function ReviewSend({
  apiResponse,
  onSign,
  onBack,
}: {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
}) {
  const { result } = apiResponse;
  return (
    <div>
      <h3>Review Transaction</h3>
      <p>
        <strong>From:</strong> {formatAddress(result.params.source, true)}
      </p>
      <p>
        <strong>To:</strong> {result.params.destination}
      </p>
      <p>
        <strong>Quantity:</strong>{" "}
        {formatAmount({
          value: Number(result.params.quantity),
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })}
      </p>
      {result.params.memo && (
        <p>
          <strong>Memo:</strong> {result.params.memo}
        </p>
      )}
      <p>
        <strong>Fee:</strong>{" "}
        {formatAmount({
          value: result.btc_fee / 1e8,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })}{" "}
        BTC
      </p>
      <button onClick={onBack}>Back</button>
      <button onClick={onSign}>Sign &amp; Broadcast</button>
    </div>
  );
}
