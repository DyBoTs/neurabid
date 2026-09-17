import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriceDisplay } from './PriceDisplay';

describe('PriceDisplay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the amount formatted as currency', () => {
    render(<PriceDisplay amount={105} />);
    expect(screen.getByTestId('price-display')).toHaveTextContent('$105.00');
  });

  it('does not flash on first render', () => {
    render(<PriceDisplay amount={100} />);
    expect(screen.getByTestId('price-display').className).not.toMatch(/flash/);
  });

  it('flashes when the amount changes to a new value', () => {
    const { rerender } = render(<PriceDisplay amount={100} />);
    rerender(<PriceDisplay amount={110} />);
    expect(screen.getByTestId('price-display').className).toMatch(/flash/);
    expect(screen.getByTestId('price-display')).toHaveTextContent('$110.00');
  });

  it('does not flash when re-rendered with the same amount', () => {
    const { rerender } = render(<PriceDisplay amount={100} />);
    rerender(<PriceDisplay amount={100} />);
    expect(screen.getByTestId('price-display').className).not.toMatch(/flash/);
  });

  it('does not flash when the user prefers reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    );
    const { rerender } = render(<PriceDisplay amount={100} />);
    rerender(<PriceDisplay amount={110} />);
    expect(screen.getByTestId('price-display').className).not.toMatch(/flash/);
  });
});
