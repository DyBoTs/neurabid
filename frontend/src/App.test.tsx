import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the foundation checkpoint heading', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ status: 'ok', checks: {} }) }),
    );
    render(<App />);
    expect(screen.getByRole('heading', { name: 'NeuraBid' })).toBeInTheDocument();
  });

  it('shows unreachable message when the backend fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Backend unreachable');
  });
});
