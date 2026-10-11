import { act, fireEvent, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { HeaderProvider, useHeader } from '@/contexts/header-context';
import { Header } from './header';

function CurrentHeader() {
  const { headerProps } = useHeader();
  return <Header {...headerProps} />;
}

function Wrapper({ children }: { children: ReactNode }) {
  return <HeaderProvider>{children}<CurrentHeader /></HeaderProvider>;
}

it.each(['leftButton', 'rightButton'] as const)('updates %s disabled state without changing the handler', side => {
  const click = vi.fn();
  const { result } = renderHook(useHeader, { wrapper: Wrapper });
  const config = { ariaLabel: 'Action', onClick: click };
  act(() => result.current.setHeaderProps({ [side]: config }));
  fireEvent.click(screen.getByRole('button', { name: 'Action' }));
  expect(click).toHaveBeenCalledTimes(1);
  act(() => result.current.setHeaderProps({ [side]: { ...config, disabled: true } }));
  expect(screen.getByRole('button', { name: 'Action' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Action' }));
  expect(click).toHaveBeenCalledTimes(1);
  act(() => result.current.setHeaderProps({ [side]: config }));
  expect(screen.getByRole('button', { name: 'Action' })).toBeEnabled();
});

it.each(['leftButton', 'rightButton'] as const)('updates %s label and icon without changing its accessible name or handler', side => {
  const { result } = renderHook(useHeader, { wrapper: Wrapper });
  const config = { ariaLabel: 'Action', onClick: vi.fn(), label: 'Before', icon: <span>Old icon</span> };
  act(() => result.current.setHeaderProps({ [side]: config }));
  act(() => result.current.setHeaderProps({ [side]: { ...config, label: 'After' } }));
  expect(screen.getByRole('button', { name: 'Action' })).toHaveTextContent('After');
  act(() => result.current.setHeaderProps({ [side]: { ...config, label: 'After', icon: <span>New icon</span> } }));
  expect(screen.getByRole('button', { name: 'Action' })).toHaveTextContent('New icon');
  expect(screen.queryByText('Old icon')).not.toBeInTheDocument();
});
