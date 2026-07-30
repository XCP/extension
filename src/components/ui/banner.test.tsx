import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Banner, type BannerSeverity } from './banner';

// Mock local icons as identifiable stubs.
vi.mock('@/components/icons', () => ({
  FiAlertTriangle: (p: any) => <div data-testid="icon-warning" {...p} />,
  FiShieldOff: (p: any) => <div data-testid="icon-danger" {...p} />,
  FiInfo: (p: any) => <div data-testid="icon-info" {...p} />,
  FaCheckCircle: (p: any) => <div data-testid="icon-success" {...p} />,
}));

describe('Banner', () => {
  it('renders the title', () => {
    render(<Banner severity="warning" title="Heads up" />);
    expect(screen.getByText('Heads up')).toBeInTheDocument();
  });

  it('renders the description and children', () => {
    render(
      <Banner severity="danger" title="Blocked" description="A bad thing">
        <ul><li>detail</li></ul>
      </Banner>
    );
    expect(screen.getByText('A bad thing')).toBeInTheDocument();
    expect(screen.getByText('detail')).toBeInTheDocument();
  });

  it.each<[BannerSeverity, string, string]>([
    ['danger', 'bg-danger-50', 'icon-danger'],
    ['warning', 'bg-warning-50', 'icon-warning'],
    ['info', 'bg-info-50', 'icon-info'],
    ['success', 'bg-success-50', 'icon-success'],
  ])('applies %s severity tokens and default icon', (severity, bgClass, iconTestId) => {
    const { container } = render(<Banner severity={severity} title="t" />);
    expect(container.firstChild).toHaveClass(bgClass);
    expect(screen.getByTestId(iconTestId)).toBeInTheDocument();
  });

  it('lets the caller override the icon', () => {
    const Custom = (p: any) => <div data-testid="icon-custom" {...p} />;
    render(<Banner severity="info" title="t" icon={Custom} />);
    expect(screen.getByTestId('icon-custom')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-info')).not.toBeInTheDocument();
  });

  it('forwards a custom className onto the container', () => {
    const { container } = render(<Banner severity="success" title="t" className="mt-8" />);
    expect(container.firstChild).toHaveClass('mt-8');
  });

  it('omits the description paragraph when none is given', () => {
    render(<Banner severity="info" title="only title" />);
    expect(screen.getByText('only title')).toBeInTheDocument();
  });
});
