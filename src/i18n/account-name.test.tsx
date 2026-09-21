import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { displayAccountName } from '@/components/domain/account-name';
import { ApprovalWalletHeader } from '@/components/domain/approval/approval-chrome';
import { mockBrowserLocale } from '@/i18n/test-utils';

afterEach(() => { cleanup(); mockBrowserLocale({ language: 'en' }); });

describe.each([
  ['en', 'Wallet 12', 'Address 12', 'UTXO Address 12'],
  ['ja', 'ウォレット 12', 'アドレス 12', 'UTXO アドレス 12'],
  ['zh-CN', '钱包 12', '地址 12', 'UTXO 地址 12'],
  ['zh-TW', '錢包 12', '地址 12', 'UTXO 地址 12'],
  ['zh-HK', '錢包 12', '地址 12', 'UTXO 地址 12'],
])('default names in %s', (language, wallet, address, utxo) => {
  it('localizes canonical defaults and keeps the original numeric suffix', () => {
    mockBrowserLocale({ language });
    expect(displayAccountName('Wallet 12')).toBe(wallet);
    expect(displayAccountName('Address 12')).toBe(address);
    expect(displayAccountName('UTXO Address 12')).toBe(utxo);
    expect(displayAccountName('Wallet 00012345678901234567890')).toContain('00012345678901234567890');
  });

  it('translates an approval label without changing the wallet identity or custom label', () => {
    mockBrowserLocale({ language });
    const identity = Object.freeze({ walletName: 'Wallet 12', address: 'bc1qexample' });
    const { rerender } = render(<ApprovalWalletHeader {...identity} />);
    expect(screen.getByText(wallet)).toBeInTheDocument();
    expect(screen.getByText(identity.address)).toBeInTheDocument();
    expect(identity.walletName).toBe('Wallet 12');
    rerender(<ApprovalWalletHeader {...identity} walletName="Savings — Wallet 12" />);
    expect(screen.getByText('Savings — Wallet 12')).toBeInTheDocument();
  });
});

it.each(['', 'Savings', 'wallet 1', 'Wallet', 'Wallet 1 savings', 'My Address 1', 'Wallet -1',
  'Wallet 1.5', 'Wallet １', ' Wallet 1', 'Wallet 1 ', 'Wallet 1\n', 'Address 1\r\n',
  'Address\n1', 'UTXO Address 1 backup', 'ウォレット 1'])('preserves custom label %j exactly', name => {
  mockBrowserLocale({ language: 'ja' });
  expect(displayAccountName(name)).toBe(name);
});
