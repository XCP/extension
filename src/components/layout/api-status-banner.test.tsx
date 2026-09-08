import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureLocale } from '@/i18n';
import { ApiStatusBanner } from './api-status-banner';

const status = vi.hoisted(() => ({ value: { status: 'rate-limited', statusCode: 429, message: 'API rate limited. Requests may be slow.', dismiss: vi.fn() } }));
vi.mock('@/contexts/api-status-context', () => ({ useApiStatus: () => status.value }));
afterEach(() => { cleanup(); configureLocale({ language: 'en', numberLocale: 'auto' }); });

describe('API status localization boundary', () => {
  it('translates a known HTTP status while retaining its code', () => {
    configureLocale({ language: 'ja' });
    status.value.message = 'API rate limited. Requests may be slow.';
    render(<ApiStatusBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent('API のリクエスト上限に達しました。');
    expect(screen.getByRole('alert')).toHaveTextContent('(429)');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Requests may be slow');
  });

  it('keeps unfamiliar diagnostic details intact beneath the translated status', () => {
    configureLocale({ language: 'zh-TW' });
    status.value.message = 'upstream quota scope: expensive-index';
    render(<ApiStatusBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent('API 請求過於頻繁。');
    expect(screen.getByRole('alert')).toHaveTextContent('upstream quota scope: expensive-index');
  });
});
