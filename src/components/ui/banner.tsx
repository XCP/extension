import { memo, type ComponentType, type ReactNode } from 'react';
import { FiAlertTriangle, FiShieldOff, FiInfo, FaCheckCircle } from '@/components/icons';

export type BannerSeverity = 'danger' | 'warning' | 'info' | 'success';

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

interface BannerProps {
  severity: BannerSeverity;
  /** Bold heading line. */
  title: string;
  /** Convenience single-line body; renders below the title. */
  description?: string;
  /** Richer body (e.g. a list); renders after `description`. */
  children?: ReactNode;
  /** Override the default per-severity icon. */
  icon?: IconComponent;
  className?: string;
}

/*
 * Static per-severity class map — full literal strings so Tailwind's extractor
 * sees them (a `bg-${severity}-50` template would silently produce no CSS).
 * Colors come from the Phase 0 semantic tokens (see popup/style.css).
 */
const SEVERITY: Record<BannerSeverity, { container: string; icon: string; text: string; Icon: IconComponent }> = {
  danger:  { container: 'bg-danger-50 border-danger-200',   icon: 'text-danger-600',  text: 'text-danger-800',  Icon: FiShieldOff },
  warning: { container: 'bg-warning-50 border-warning-200', icon: 'text-warning-600', text: 'text-warning-800', Icon: FiAlertTriangle },
  info:    { container: 'bg-info-50 border-info-200',       icon: 'text-info-600',    text: 'text-info-800',    Icon: FiInfo },
  success: { container: 'bg-success-50 border-success-200', icon: 'text-success-600', text: 'text-success-800', Icon: FaCheckCircle },
};

/**
 * Banner — the single severity-driven callout primitive.
 *
 * Replaces the icon + title + body boxes that were hand-rolled across the app.
 * Layout and spacing match the prior markup so it is a drop-in; severity picks
 * the semantic color and default icon.
 */
export const Banner = memo<BannerProps>(({ severity, title, description, children, icon, className = '' }) => {
  const s = SEVERITY[severity];
  const Icon = icon ?? s.Icon;
  return (
    <div className={`rounded-lg border p-4 ${s.container} ${className}`}>
      <div className="flex items-start">
        <Icon className={`size-5 ${s.icon} mt-0.5 mr-2 flex-shrink-0`} aria-hidden="true" />
        <div className={`text-sm ${s.text}`}>
          <p className="font-medium">{title}</p>
          {description && <p className="text-xs mt-1">{description}</p>}
          {children}
        </div>
      </div>
    </div>
  );
});

Banner.displayName = 'Banner';
