import { useState, useCallback, useRef, useEffect } from "react";

const DEFAULT_FEEDBACK_MS = 2000;

/**
 * Cross-browser clipboard copy with visual feedback state.
 *
 * Uses navigator.clipboard.writeText with fallback to execCommand
 * for older browsers.
 *
 * @param feedbackMs - Duration to show "copied" state (default 2000ms)
 * @returns Object with copy function and state helpers
 *
 * @example
 * const { copy, copiedText, isCopied } = useCopyToClipboard();
 *
 * <button onClick={() => copy(address)}>
 *   {isCopied(address) ? <CheckIcon /> : <CopyIcon />}
 * </button>
 */
export function useCopyToClipboard(feedbackMs: number = DEFAULT_FEEDBACK_MS) {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    try {
      // Modern approach - works in most browsers
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        const success = document.execCommand("copy");
        document.body.removeChild(textarea);

        if (!success) {
          throw new Error("execCommand copy failed");
        }
      }

      setCopiedText(text);
      timeoutRef.current = setTimeout(() => {
        setCopiedText(null);
      }, feedbackMs);

      return true;
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      setCopiedText(null);
      return false;
    }
  }, [feedbackMs]);

  const isCopied = useCallback((text: string): boolean => {
    return copiedText === text;
  }, [copiedText]);

  return {
    copy,
    copiedText,
    isCopied,
  };
}
