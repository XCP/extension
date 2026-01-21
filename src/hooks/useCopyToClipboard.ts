import { useState, useCallback, useRef, useEffect } from "react";
import { analytics } from "@/utils/fathom";

const DEFAULT_FEEDBACK_MS = 2000;
const DEFAULT_AUTO_CLEAR_MS = 30000; // 30 seconds

/**
 * Cross-browser clipboard copy with visual feedback state and auto-clear.
 *
 * Uses navigator.clipboard.writeText with fallback to execCommand
 * for older browsers. Automatically clears clipboard after a timeout
 * to prevent sensitive data from persisting.
 *
 * @param feedbackMs - Duration to show "copied" state (default 2000ms)
 * @param autoClearMs - Duration before clearing clipboard (default 30000ms, 0 to disable)
 * @returns Object with copy function and state helpers
 *
 * @example
 * const { copy, copiedText, isCopied } = useCopyToClipboard();
 *
 * <button onClick={() => copy(address)}>
 *   {isCopied(address) ? <CheckIcon /> : <CopyIcon />}
 * </button>
 */
export function useCopyToClipboard(
  feedbackMs: number = DEFAULT_FEEDBACK_MS,
  autoClearMs: number = DEFAULT_AUTO_CLEAR_MS
) {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (autoClearRef.current) {
        clearTimeout(autoClearRef.current);
      }
    };
  }, []);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    // Clear any existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (autoClearRef.current) {
      clearTimeout(autoClearRef.current);
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
      analytics.track('copy_to_clipboard');
      timeoutRef.current = setTimeout(() => {
        setCopiedText(null);
      }, feedbackMs);

      // Auto-clear clipboard after timeout (security feature)
      if (autoClearMs > 0 && navigator.clipboard?.writeText) {
        autoClearRef.current = setTimeout(() => {
          navigator.clipboard.writeText("").catch(() => {
            // Silently fail - clipboard may not be accessible
          });
        }, autoClearMs);
      }

      return true;
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      setCopiedText(null);
      return false;
    }
  }, [feedbackMs, autoClearMs]);

  const isCopied = useCallback((text: string): boolean => {
    return copiedText === text;
  }, [copiedText]);

  return {
    copy,
    copiedText,
    isCopied,
  };
}
