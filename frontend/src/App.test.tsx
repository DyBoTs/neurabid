import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the landing page at the root route', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) }));
    render(<App />);
    expect(screen.getByRole('heading', { name: 'NeuraBid' })).toBeInTheDocument();
  });

  it('renders the navigation with a link to the marketplace', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) }));
    render(<App />);
    expect(screen.getByRole('link', { name: 'Marketplace' })).toBeInTheDocument();
  });
});
