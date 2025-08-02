# Components Directory

This directory contains React components for the XCP Wallet extension UI.

## Component Patterns

### Component Structure
- Use functional components with TypeScript
- Export components as default exports
- Keep components focused and single-purpose
- Prefer composition over complex props

### Naming Conventions
- PascalCase for component files and exports (e.g., `Button.tsx`, `ErrorAlert.tsx`)
- Descriptive names that indicate purpose
- Group related components in subdirectories when appropriate

### TypeScript Patterns
```typescript
// Always define prop types
interface ComponentProps {
  required: string;
  optional?: boolean;
  children?: React.ReactNode;
}

// Use explicit return types for clarity
export default function Component({ required, optional = false }: ComponentProps): JSX.Element {
  return <div>{/* component content */}</div>;
}
```

## Styling Guidelines

### Tailwind CSS Usage
- Use Tailwind v4 utility classes exclusively
- Avoid inline styles or CSS modules
- Use semantic color classes from the design system
- Apply responsive modifiers when needed

### Common Patterns
```tsx
// Conditional styling
<div className={cn(
  "base-classes",
  isActive && "active-classes",
  isDisabled && "disabled-classes"
)}>

// Responsive design
<div className="w-full md:w-1/2 lg:w-1/3">
```

## Component Categories

### Core UI Components
- **Button.tsx**: Primary action button with loading states
- **Spinner.tsx**: Loading indicator component
- **ErrorAlert.tsx**: Error message display with Headless UI

### Layout Components
- **Layout.tsx**: Main app layout wrapper
- **Header.tsx**: App header with navigation
- **Footer.tsx**: Footer navigation component

### Feature Components
- **Composer.tsx**: Transaction composition UI
- **QrCode.tsx**: QR code generation for addresses

## State Management

### Context Usage
- Components should consume contexts via hooks
- Avoid prop drilling - use contexts for widely-used state
- Keep component state local when possible

### Event Handling
- Use descriptive handler names (e.g., `handleSubmit`, `handleAddressChange`)
- Prevent default behavior explicitly when needed
- Debounce expensive operations

## Accessibility

### ARIA Requirements
- Use semantic HTML elements
- Add ARIA labels for interactive elements
- Ensure keyboard navigation works
- Use Headless UI components for complex interactions

### Focus Management
- Manage focus for modals and dropdowns
- Provide visual focus indicators
- Support keyboard shortcuts where appropriate

## Testing Patterns

### Component Testing
- Test user interactions, not implementation
- Mock context providers when needed
- Test error states and edge cases
- Verify accessibility attributes

## Performance Considerations

### Optimization Techniques
- Use React.memo for expensive components
- Implement useMemo/useCallback where beneficial
- Lazy load heavy components
- Optimize re-renders with proper dependencies

### Code Splitting
- Dynamic imports for route-based components
- Lazy load modals and overlays
- Bundle size awareness

## Common Imports

```typescript
// React essentials
import { useState, useEffect, useMemo } from 'react';

// Routing
import { Link, useNavigate } from 'react-router-dom';

// UI Libraries
import { Dialog, Menu, Transition } from '@headlessui/react';

// Icons
import { IconName } from 'react-icons/fi';

// Contexts
import { useWalletContext } from '@/contexts/wallet-context';

// Utils
import { cn } from '@/utils/format';
```

## Anti-Patterns to Avoid

1. **Don't use any type** - Always define proper TypeScript types
2. **Don't manipulate DOM directly** - Use React state and refs
3. **Don't use inline functions in JSX** - Define handlers separately
4. **Don't ignore console errors** - Fix React warnings
5. **Don't create huge components** - Break down into smaller pieces

## Component Checklist

When creating or modifying components:
- [ ] TypeScript props interface defined
- [ ] Proper error handling implemented
- [ ] Loading states considered
- [ ] Accessibility attributes added
- [ ] Responsive design applied
- [ ] Performance optimized
- [ ] No console errors or warnings