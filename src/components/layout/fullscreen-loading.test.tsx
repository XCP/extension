import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { FullscreenLoading } from './fullscreen-loading';

it('announces loading independently of the decorative spinner', () => {
  render(<FullscreenLoading />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  expect(screen.getByText(/Loading/).closest('[aria-hidden="true"]')).toBeNull();
});
