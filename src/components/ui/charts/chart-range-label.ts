import { t } from '@/i18n';

/** Translate only the visible label; range IDs sent to price readers stay unchanged. */
export function chartRangeLabel(range: '1h' | '24h' | '7d' | '30d' | '1y' | 'all'): string {
  switch (range) {
    case '1h': return t('charts_range_hours', ['1']);
    case '24h': return t('charts_range_hours', ['24']);
    case '7d': return t('charts_range_days', ['7']);
    case '30d': return t('charts_range_days', ['30']);
    case '1y': return t('charts_range_years', ['1']);
    case 'all': return t('market_xcp_all');
  }
}
