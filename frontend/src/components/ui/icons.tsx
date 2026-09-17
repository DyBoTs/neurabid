/**
 * Small hand-rolled SVG icons — never emoji (docs/06-design-system.md §15).
 * Kept minimal on purpose: this project needs a handful of status glyphs,
 * not an icon library dependency.
 */
import type { SVGProps } from 'react';

function base(props: SVGProps<SVGSVGElement>) {
  return {
    width: 12,
    height: 12,
    viewBox: '0 0 12 12',
    'aria-hidden': true,
    ...props,
  };
}

export function DotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="6" cy="6" r="5" fill="currentColor" />
    </svg>
  );
}

export function SlashedDotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="10" x2="10" y2="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function SpinnerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle
        cx="6"
        cy="6"
        r="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="20"
        strokeDashoffset="8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function StopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="2" width="8" height="8" fill="currentColor" />
    </svg>
  );
}

export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6" y1="6" x2="6" y2="3" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6" y1="6" x2="8.2" y2="7" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
