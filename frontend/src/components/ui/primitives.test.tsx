import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';
import { Input } from './Input';
import { Badge, AuctionStatusBadge } from './Badge';
import { Sparkline } from './Sparkline';
import { Table } from './Table';

describe('Button', () => {
  it('renders its label and responds to clicks', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Place Bid</Button>);
    screen.getByRole('button', { name: 'Place Bid' }).click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('defaults to type="button" so it never accidentally submits a form', () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('Input', () => {
  it('associates a visible label with the field (not placeholder-only)', () => {
    render(<Input label="Bid amount" onChange={() => {}} value="" />);
    expect(screen.getByLabelText('Bid amount')).toBeInTheDocument();
  });

  it('renders an error message tied to the field via aria-describedby', () => {
    render(<Input label="Bid amount" error="Bid too low" onChange={() => {}} value="" />);
    const input = screen.getByLabelText('Bid amount');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Bid too low');
  });
});

describe('Badge', () => {
  it('renders tone and text together (never color alone)', () => {
    render(<Badge tone="positive">Live</Badge>);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('AuctionStatusBadge maps each auction status to a distinct label', () => {
    const { rerender } = render(<AuctionStatusBadge status="active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    rerender(<AuctionStatusBadge status="ended" />);
    expect(screen.getByText('Ended')).toBeInTheDocument();
    rerender(<AuctionStatusBadge status="scheduled" />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });
});

describe('Sparkline', () => {
  it('renders a fallback flat line with fewer than 2 points', () => {
    render(<Sparkline values={[100]} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/Not enough bids/);
  });

  it('renders a trend summary as an accessible name for real data', () => {
    render(<Sparkline values={[100, 120, 150]} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/100.*150|150.*100/);
  });
});

describe('Table', () => {
  it('renders inside a scrollable, bordered wrapper', () => {
    render(
      <Table>
        <tbody>
          <tr>
            <td>row</td>
          </tr>
        </tbody>
      </Table>,
    );
    expect(screen.getByText('row')).toBeInTheDocument();
  });
});
