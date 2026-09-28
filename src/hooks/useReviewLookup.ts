import { useEffect, useState } from "react";

/** A ledger fact a review page looks up: still loading, read, or unreadable. */
export type ReviewLookup<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "failed" };

/**
 * Read one ledger fact for a review page, keyed so it reruns only when what it names changes.
 *
 * A failed read is its own state rather than an absent value: the page says the lookup failed
 * instead of showing nothing, which would read the same as "there is nothing to show". Nothing
 * here gates signing; a page that must not sign without the fact decides that itself.
 *
 * @param key - what the lookup names (a hash, an asset, a list of outpoints); undefined means
 *   there is nothing to look up, which is reported as failed.
 */
export function useReviewLookup<T>(key: string | undefined, read: () => Promise<T>): ReviewLookup<T> {
  const [state, setState] = useState<ReviewLookup<T>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (!key) {
      setState({ status: "failed" });
      return;
    }
    setState({ status: "loading" });
    read().then(
      (value) => {
        if (!cancelled) setState({ status: "ready", value });
      },
      (err) => {
        console.error("Review lookup failed:", err);
        if (!cancelled) setState({ status: "failed" });
      },
    );
    return () => {
      cancelled = true;
    };
    // `read` is a fresh closure every render; the key is what it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
