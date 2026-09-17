import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus } from './ConnectionStatus';

describe('ConnectionStatus', () => {
  it('announces "Live" when connected', () => {
    render(<ConnectionStatus state="connected" />);
    expect(screen.getByRole('status')).toHaveTextContent('Live');
  });

  it('announces "Disconnected" when disconnected', () => {
    render(<ConnectionStatus state="disconnected" />);
    expect(screen.getByRole('status')).toHaveTextContent('Disconnected');
  });

  it('announces "Reconnecting…" while reconnecting', () => {
    render(<ConnectionStatus state="reconnecting" />);
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');
  });

  it('announces "Connecting…" on first connect', () => {
    render(<ConnectionStatus state="connecting" />);
    expect(screen.getByRole('status')).toHaveTextContent('Connecting');
  });
});
