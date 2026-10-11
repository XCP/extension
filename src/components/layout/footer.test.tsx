import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { Footer } from './footer';

const fixture = vi.hoisted(() => ({ hasVisitedRecoverBitcoin: false, addressFormat: '' }));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => ({ settings: fixture }) }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => ({ activeWallet: { addressFormat: fixture.addressFormat } }) }));

beforeEach(() => { fixture.hasVisitedRecoverBitcoin = false; fixture.addressFormat = AddressFormat.P2WPKH; });

function setup(path = '/index') {
  render(<MemoryRouter initialEntries={[path]}><Footer /></MemoryRouter>);
  return within(screen.getByRole('navigation', { name: 'Primary' }));
}

it('exposes four named navigation links with real destinations', () => {
  const navigation = setup();
  expect(navigation.getAllByRole('link')).toHaveLength(4);
  for (const [name, href] of [['Wallet', '/index'], ['Market', '/market'], ['Actions', '/actions'], ['Settings', '/settings']]) {
    expect(navigation.getByRole('link', { name })).toHaveAttribute('href', href);
  }
});

it.each([
  ['/index', 'Wallet'], ['/market', 'Market'], ['/market/orders', 'Market'],
  ['/actions/consolidate', 'Actions'], ['/settings/security', 'Settings'],
])('marks the active section for %s', (path, name) => {
  const navigation = setup(path);
  expect(navigation.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
  expect(navigation.getAllByRole('link').filter(link => link.hasAttribute('aria-current'))).toHaveLength(1);
});

it.each(['/unknown', '/marketplace', '/index/unknown'])('does not mark unrelated route %s as current', path => {
  expect(setup(path).getAllByRole('link').every(link => !link.hasAttribute('aria-current'))).toBe(true);
});

it('navigates using the router and updates the current section', () => {
  const navigation = setup();
  for (const name of ['Market', 'Actions', 'Settings', 'Wallet']) {
    fireEvent.click(navigation.getByRole('link', { name }));
    expect(navigation.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
  }
});

it.each([
  [AddressFormat.P2PKH, false, true], [AddressFormat.P2PKH, true, false], [AddressFormat.P2WPKH, false, false],
])('preserves the recovery badge for format %s and visited=%s', (format, visited, badge) => {
  fixture.addressFormat = format; fixture.hasVisitedRecoverBitcoin = visited;
  const actions = setup().getByRole('link', { name: 'Actions' });
  expect(actions.querySelector('.bg-orange-500') !== null).toBe(badge);
});
