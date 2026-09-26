import { type ComponentType, lazy, type ReactElement, useState } from 'react';

type PageModule = { default: ComponentType };

const preloaders: Array<() => Promise<unknown>> = [];

/**
 * A route page loaded on demand, so opening the popup parses only the pages it can land on.
 *
 * Once its chunk has loaded (on first visit, or by preloadPages), the page renders directly
 * instead of through React.lazy, which would still suspend once and flash the fallback. The
 * choice is made once per mount so a later re-render never swaps the component type under a
 * mounted page and resets its state.
 */
export function lazyPage(load: () => Promise<PageModule>): ComponentType {
  let loaded: ComponentType | undefined;
  let pending: Promise<PageModule> | undefined;
  const preload = (): Promise<PageModule> => {
    pending ??= load().then((module) => {
      loaded = module.default;
      return module;
    }, (error: unknown) => {
      pending = undefined; // let a later visit retry a failed chunk load
      throw error;
    });
    return pending;
  };
  const Lazy = lazy(preload);
  preloaders.push(preload);

  return function LazyPage(): ReactElement {
    const [Page] = useState<ComponentType>(() => loaded ?? Lazy);
    return <Page />;
  };
}

/**
 * Load every lazy page's chunk in the background, one per idle period, so later navigation
 * does not show the loading spinner. Failures are ignored here; a visit retries the load.
 */
export function preloadPages(): () => void {
  let cancelled = false;
  let handle: number | undefined;
  const queue = [...preloaders];
  const schedule = (callback: () => void) => typeof requestIdleCallback === 'function'
    ? requestIdleCallback(callback)
    : window.setTimeout(callback, 1);
  const next = () => {
    const preload = queue.shift();
    if (cancelled || !preload) return;
    void preload().catch(() => undefined).finally(() => { if (!cancelled) handle = schedule(next); });
  };
  handle = schedule(next);
  return () => {
    cancelled = true;
    if (handle === undefined) return;
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(handle);
    else window.clearTimeout(handle);
  };
}
