import { ReviewScreen } from "@/components/screens/review-screen";

interface ReviewAddressOptionsProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

const ADDRESS_OPTION_REQUIRE_MEMO = 1;

const formatOptionsText = (text: string | number | undefined) => {
  if (!text) return "None";
  if (typeof text === "number") {
    return text === ADDRESS_OPTION_REQUIRE_MEMO ? "Require Memo" : String(text);
  }
  const match = text.match(/options (\d+)/);
  if (match) {
    const value = parseInt(match[1], 10);
    return value === ADDRESS_OPTION_REQUIRE_MEMO ? "Require Memo" : String(value);
  }
  return String(text);
};

export function ReviewAddressOptions({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  setError 
}: ReviewAddressOptionsProps) {
  const { result } = apiResponse;

  const customFields = [
    {
      label: "Options",
      value: formatOptionsText(result.params.options || result.params.text),
    },
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
