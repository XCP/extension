import { FaYoutube } from "react-icons/fa";

interface YouTubeTutorialCTAProps {
  text: string;
  url?: string;
}

export function YouTubeTutorialCTA({ 
  text, 
  url = "https://youtube.com/" 
}: YouTubeTutorialCTAProps) {
  // Use default URL if empty string is provided
  const href = url || "https://youtube.com/";
  
  return (
    <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-3 text-gray-700 hover:text-red-600 transition-colors"
        aria-label={`${text} - Opens in new tab`}
      >
        <FaYoutube className="text-2xl text-red-600" aria-hidden="true" />
        <span className="font-medium">{text}</span>
      </a>
    </div>
  );
}