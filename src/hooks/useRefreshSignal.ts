import { useEffect, useRef } from 'react';

/**
 * Run something when a refresh is asked for, but not on the first render.
 *
 * The lists on the home screen already load when they mount. Reacting to the initial value of a
 * refresh counter as though it were a request would load everything twice on every visit to the
 * screen, so the first render is deliberately ignored and only later changes count.
 *
 * The callback is held in a ref rather than listed as a dependency. Callers pass an inline arrow,
 * which is a new function on every render of the parent; depending on it would re-run this effect
 * constantly, and for a callback that reloads a list that is an endless loop rather than a
 * performance note.
 *
 * @param nonce - Changes to request a refresh. Undefined means the caller never refreshes this one.
 * @param onRefresh - What to do about it, usually resetting whatever guards the initial load.
 */
export function useRefreshSignal(nonce: number | undefined, onRefresh: () => void): void {
  const isFirstRender = useRef(true);
  const latestOnRefresh = useRef(onRefresh);
  latestOnRefresh.current = onRefresh;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    latestOnRefresh.current();
  }, [nonce]);
}
