import { useState } from "react";

export function SendForm({ onSubmit }: { onSubmit: (data: any) => void }) {
  const [destination, setDestination] = useState("");
  const [quantity, setQuantity] = useState("");
  const [memo, setMemo] = useState("");
  const [feeRateSatPerVByte, setFeeRateSatPerVByte] = useState(1);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      // For simplicity we assume a single destination.
      destinations: [{ id: 0, address: destination }],
      asset: "XCP", // In your app you might allow selecting the asset.
      quantity,
      memo,
      feeRateSatPerVByte,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Destination Address:</label>
        <input
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          required
        />
      </div>
      <div>
        <label>Quantity:</label>
        <input
          type="text"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
        />
      </div>
      <div>
        <label>Memo (optional):</label>
        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </div>
      <div>
        <label>Fee Rate (sat/vB):</label>
        <input
          type="number"
          value={feeRateSatPerVByte}
          onChange={(e) => setFeeRateSatPerVByte(Number(e.target.value))}
          required
        />
      </div>
      <button type="submit">Continue</button>
    </form>
  );
}
