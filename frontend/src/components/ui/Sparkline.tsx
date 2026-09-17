/**
 * A minimal inline-SVG line chart for one real time-series: bid price
 * history within an auction. No charting library — the data volume here
 * (a handful to a few dozen points) doesn't justify one. See
 * docs/06-design-system.md §10 for why this is the only chart NeuraBid
 * uses, and why a candlestick/OHLC chart would be a meaningless one.
 */
interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
}

export function Sparkline({ values, width = 160, height = 32 }: SparklineProps) {
  if (values.length < 2) {
    return (
      <svg width={width} height={height} role="img" aria-label="Not enough bids yet for a trend">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--color-border)"
          strokeWidth={1}
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });

  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = points[points.length - 1];

  const summary = `Bid history from $${min.toFixed(2)} to $${max.toFixed(2)}, currently $${values[values.length - 1].toFixed(2)}`;

  return (
    <svg width={width} height={height} role="img" aria-label={summary}>
      <path d={path} fill="none" stroke="var(--color-text-muted)" strokeWidth={1.5} />
      <circle cx={lastX} cy={lastY} r={2.5} fill="var(--color-positive)" />
    </svg>
  );
}
