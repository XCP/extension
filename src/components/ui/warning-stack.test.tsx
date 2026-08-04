import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { type WarningItem, WarningStack } from './warning-stack';

vi.mock('@/components/icons', () => ({
  FiAlertTriangle: (p: any) => <div {...p} />,
  FiShieldOff: (p: any) => <div {...p} />,
  FiInfo: (p: any) => <div {...p} />,
  FaCheckCircle: (p: any) => <div {...p} />,
}));

const titles = () => screen.getAllByText(/^item-/).map(el => el.textContent);

describe('WarningStack', () => {
  it('renders nothing when empty', () => {
    const { container } = render(<WarningStack items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('orders danger → warning → info → success regardless of input order', () => {
    const items: WarningItem[] = [
      { key: 'a', severity: 'success', title: 'item-success' },
      { key: 'b', severity: 'warning', title: 'item-warning' },
      { key: 'c', severity: 'danger', title: 'item-danger' },
      { key: 'd', severity: 'info', title: 'item-info' },
    ];
    render(<WarningStack items={items} />);
    expect(titles()).toEqual(['item-danger', 'item-warning', 'item-info', 'item-success']);
  });

  it('preserves insertion order within the same severity', () => {
    const items: WarningItem[] = [
      { key: 'a', severity: 'warning', title: 'item-first' },
      { key: 'b', severity: 'warning', title: 'item-second' },
      { key: 'c', severity: 'danger', title: 'item-danger' },
    ];
    render(<WarningStack items={items} />);
    expect(titles()).toEqual(['item-danger', 'item-first', 'item-second']);
  });
});
