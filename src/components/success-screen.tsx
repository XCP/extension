import { FaCheckCircle } from "react-icons/fa";

interface SuccessScreenProps {
  apiResponse: any;
  onReset: () => void;
}

export function SuccessScreen({ apiResponse, onReset }: SuccessScreenProps) {
  const broadcastResponse = apiResponse.broadcast;
  const txid = broadcastResponse?.txid || "unknown";
  // Adjust the explorer URL as needed
  const explorerUrl = `https://blockchain.info/tx/${txid}`;

  return (
    <div className="p-4 bg-green-50 rounded-lg shadow-lg text-center">
      <FaCheckCircle className="text-green-600 w-12 h-12 mx-auto" />
      <h2 className="text-2xl font-bold text-green-800 mt-4">
        Transaction Successful!
      </h2>
      <p className="mt-2 text-green-700">
        Your transaction has been broadcast successfully.
      </p>
      <div className="mt-4">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline"
        >
          View Transaction on Explorer
        </a>
      </div>
      <div className="mt-6">
        <button
          onClick={onReset}
          className="bg-green-600 text-white py-2 px-4 rounded"
        >
          Back to Form
        </button>
      </div>
    </div>
  );
}
