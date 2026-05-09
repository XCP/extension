import { useState, useEffect, useRef, useCallback } from "react";

export function useInView(options?: IntersectionObserverInit) {
  const [inView, setInView] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = useCallback((node: HTMLDivElement | null) => {
    // Disconnect previous observer if it exists
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    // If no node, we're done
    if (!node) return;

    // Create and start observing immediately
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
      },
      {
        root: options?.root || null,
        rootMargin: options?.rootMargin || "0px",
        threshold: options?.threshold || 0
      }
    );

    observer.observe(node);
    observerRef.current = observer;
  }, [options?.root, options?.rootMargin, options?.threshold]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  return { ref, inView };
}
