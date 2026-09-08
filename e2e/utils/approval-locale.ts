import { readFileSync } from 'node:fs';

const supported = ['en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const;
export type ApprovalGalleryLocale = typeof supported[number];

/** Explicit gallery choice uses the actual persisted wallet preference, not page emulation. */
export function approvalGalleryLocale(): ApprovalGalleryLocale {
  const value = process.env.XCP_GALLERY_LOCALE ?? 'en';
  const locale = supported.find(item => item === value);
  if (!locale) throw new Error(`Unsupported XCP_GALLERY_LOCALE: ${value}`);
  return locale;
}

export function approvalCatalog(locale: ApprovalGalleryLocale) {
  const catalog = JSON.parse(readFileSync(`public/_locales/${locale.replace('-', '_')}/messages.json`, 'utf8'));
  return (key: string, substitutions: string[] = []): string => {
    const entry = catalog[key];
    if (!entry) throw new Error(`Missing ${locale} approval gallery message: ${key}`);
    return entry.message
      .replace(/\$([A-Za-z0-9_]+)\$/g, (match: string, name: string) => entry.placeholders?.[name.toLowerCase()]?.content ?? match)
      .replace(/\$(\d)/g, (_: string, index: string) => substitutions[Number(index) - 1] ?? `$${index}`);
  };
}

export function literalPattern(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}
