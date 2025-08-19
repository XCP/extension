import { useState, useEffect } from "react";

interface Asset {
  symbol: string;
  supply?: string | number;
}

export const useSearchQuery = (initialQuery: string = "") => {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let isCancelled = false;

    const debounceTimeout = setTimeout(async () => {
      setIsSearching(true);
      setError(null); // Clear any previous errors when starting new search
      try {
        const response = await fetch(
          `https://app.xcp.io/api/v1/simple-search?query=${encodeURIComponent(searchQuery)}`
        );
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        if (!isCancelled) {
          setSearchResults(data.assets || []);
        }
      } catch (err) {
        console.error("Error searching assets:", err);
        if (!isCancelled) {
          setSearchResults([]);
          setError("Failed to load search results.");
        }
      } finally {
        if (!isCancelled) {
          setIsSearching(false);
        }
      }
    }, 500);

    return () => {
      clearTimeout(debounceTimeout);
      isCancelled = true;
    };
  }, [searchQuery]);

  return { searchQuery, setSearchQuery, searchResults, isSearching, error, setError };
};
