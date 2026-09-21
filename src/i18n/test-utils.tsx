/** Browser catalog fixtures for unit tests only; never imported by the extension.
 * Existing retention tests advance the fixture and explicitly rerender their roots.
 * This exercises ordinary React renders without adding live locale state to the app.
 */

import { render as rtlRender, renderHook as rtlRenderHook } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, vi } from 'vitest';
import * as i18n from '@/i18n';
import en from '../../public/_locales/en/messages.json';
import ja from '../../public/_locales/ja/messages.json';
import zhCN from '../../public/_locales/zh_CN/messages.json';
import zhHK from '../../public/_locales/zh_HK/messages.json';
import zhTW from '../../public/_locales/zh_TW/messages.json';

const catalogs: Record<string, typeof en | typeof ja> = { en, ja, 'zh-CN': zhCN, 'zh-TW': zhTW, 'zh-HK': zhHK };
const renders = new Set<() => void>();
afterEach(() => { renders.clear(); });

export function mockBrowserLocale({ language = 'en', numberLocale = 'auto' }: { language?: string; numberLocale?: string } = {}) {
  const catalog = catalogs[language] ?? en;
  vi.spyOn(chrome.i18n, 'getMessage').mockImplementation((key: string, substitutions?: string | (string | number)[]) => {
    const entry = catalog[key as keyof typeof catalog] as { message: string; placeholders?: Record<string, { content: string }> } | undefined;
    if (!entry) return '';
    const subs = typeof substitutions === 'string' ? [substitutions] : substitutions ?? [];
    return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (match, name: string) => entry.placeholders?.[name.toLowerCase()]?.content ?? match)
      .replace(/\$(\d)/g, (_, index: string) => String(subs[Number(index) - 1] ?? ''));
  });
  // Some amount-safety tests deliberately stress a hypothetical comma-decimal locale.
  // This is a formatter mock, not a persisted or user-selectable application setting.
  vi.spyOn(i18n, 'currentNumberLocale').mockImplementation(() => numberLocale === 'auto' ? i18n.currentLocale() : numberLocale);
  i18n.applyDocumentLocale();
  for (const rerender of renders) rerender();
}

function freshTree(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(freshTree);
  if (!isValidElement<{ children?: ReactNode }>(node)) return node;
  return cloneElement(node as ReactElement<Record<string, unknown>>, { 'data-locale-fixture': i18n.currentLocale() }, ...('children' in node.props ? [freshTree(node.props.children)] : []));
}

export const render: typeof rtlRender = ((ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) => {
  const result = rtlRender(ui, options);
  let current = ui;
  const rerender = () => { if (result.container.isConnected) result.rerender(freshTree(current)); };
  renders.add(rerender);
  return { ...result, rerender: (next: ReactElement) => { current = next; result.rerender(next); },
    unmount: () => { renders.delete(rerender); result.unmount(); } };
}) as typeof rtlRender;

export const renderHook: typeof rtlRenderHook = ((callback: Parameters<typeof rtlRenderHook>[0], options?: Parameters<typeof rtlRenderHook>[1]) => {
  const result = rtlRenderHook(callback, options);
  const rerender = () => result.rerender();
  renders.add(rerender);
  return { ...result, unmount: () => { renders.delete(rerender); result.unmount(); } };
}) as typeof rtlRenderHook;
