# NeuraBid Design System

This document defines NeuraBid's visual identity before any page gets built, per the project's own rule to use the installed UI skills deliberately rather than defaulting to whatever a model produces unprompted. Two real skills were available and used — `ui-ux-pro-max` (a searchable database of grounded design patterns) and `unslop-ui` (a scanner/checklist against known "this looks AI-generated" tells). `frontend-design` and `impeccable`, named in the phase brief, are not installed in this environment; substituting the closest real equivalent is noted here rather than silently ignored.

## 0. The brief, stated explicitly (per `unslop-ui`)

`unslop-ui`'s core argument: most "looks AI" results come from an *unspecified* brief, not bad taste — the model defaults to the training-data median because nobody chose anything. So before any color or font, here is the actual brief:

- **Reference/direction:** a professional trading-terminal / financial-monitoring aesthetic — the same visual family as a Bloomberg terminal or an exchange's ops dashboard, not a consumer auction site (eBay) and not a sci-fi/cyberpunk HUD. Chosen because the product's own traits (`high-integrity`, `trustworthy`, `information-dense`, `technical but not cyberpunk`) map directly onto that world, and because it's a real, nameable reference rather than "modern and clean."
- **Color decision:** dark slate background with a single restrained green accent — pulled from `ui-ux-pro-max`'s **"Financial Dashboard"** palette match (verified below, not invented), explicitly because this product's semantics (bid accepted = positive/green, bid rejected = negative/red) are the same semantics that palette was built around.
- **Type decision:** `Fira Code` (numbers, IDs, timestamps) + `Fira Sans` (UI text) — a monospace/humanist-sans pairing tagged for "dashboards, analytics, data visualization" by the same tool, chosen because a bidding system lives and dies on numbers being unambiguous at a glance (a monospace digit grid doesn't jitter as values change, which matters when prices update live).
- **Layout intent:** every page exists to answer "what is the price right now, and can I trust that number" as fast as possible. That determines structure directly — no hero-plus-three-cards skeleton, no marketing chrome. Information density and state clarity outrank decoration everywhere.

## 1. Visual direction

**"Trading terminal, not auction house."** NeuraBid should feel like the tool a professional would trust to handle real money changing hands in real time: dark, dense, numerically precise, calm under load. It should *not* feel like a consumer marketplace (no product-photo hero cards, no playful copy) and should *not* feel like a hacker/cyberpunk HUD (no neon glow, no scanlines, no glitch effects) — "technical but not cyberpunk" is a real constraint, not a throwaway phrase: glow and saturated neon are explicitly avoided in favor of a *minimal* glow limit (a soft `text-shadow`, never a full neon border) confirmed by the same search result.

Explicitly avoided, per the anti-slop brief and `unslop-ui`'s tell catalog: gradients as decoration (tell #3), any violet/indigo "AI purple" (tell #2), the cream+serif+sage "tasteful default" (tell #0), untouched shadcn/Tailwind defaults (tell #1 — moot here since no component library is used; see §12), emoji-as-icons, and rounded-corners-on-everything.

## 2. Verified color palette

Source: `ui-ux-pro-max --design-system "real-time trading auction dashboard high-integrity technical"` and a follow-up `--domain color "trading finance semantic status"` query, both returning the same **Financial Dashboard** entry independently — treated as a confirmed match, not a single unverified hit.

```css
:root {
  /* Surfaces */
  --color-background: #020617;   /* page background */
  --color-surface: #0E1223;      /* cards, panels */
  --color-surface-raised: #1E293B; /* elevated surfaces, table header */
  --color-border: #334155;

  /* Text */
  --color-text: #F8FAFC;
  --color-text-muted: #94A3B8;
  --color-text-on-accent: #0F172A;

  /* Brand / accent */
  --color-accent: #22C55E;       /* primary actions, positive state */
  --color-accent-hover: #16A34A;

  /* Semantic status (see §5) */
  --color-positive: #22C55E;
  --color-negative: #EF4444;
  --color-warning: #F59E0B;
  --color-info: #38BDF8;

  --color-focus-ring: #F8FAFC;
}
```

This is a **dark-mode-only** design, per the source pattern's own recommendation ("Light not-recommended, Dark supported") — appropriate for a projector demo in a dim room and for an information-dense, always-on monitoring surface. No separate light theme is built; this is a deliberate scope decision, not an oversight.

## 3. Typography

Source: `ui-ux-pro-max` typography match for the same design-system query — **Fira Code / Fira Sans**, tagged "dashboard, data, analytics, code, technical, precise."

- **Fira Sans** — all UI chrome: headings, labels, buttons, body copy.
- **Fira Code** — anything that is *a number or an identifier a user must trust*: prices, bid amounts, countdown timers, bid/user/auction IDs, timestamps. Tabular figures (`font-variant-numeric: tabular-nums`) are mandatory on every price so digits don't shift width as they change.

Scale (base 16px per the accessibility checklist's minimum body size):

| Token | Size | Use |
|---|---|---|
| `--text-xs` | 12px | secondary metadata (bid history sub-labels) |
| `--text-sm` | 14px | table cells, dense UI |
| `--text-base` | 16px | body copy |
| `--text-lg` | 20px | section headings |
| `--text-xl` | 28px | current price (secondary contexts) |
| `--text-2xl` | 44px | **the current price on the Live Auction page** — the single most important number on screen, sized to read from the back of a room |

## 4. Spacing and density

Source: `--density 8` dial (dashboard tier) — 8–32px spacing scale, not the spacious 24–96px marketing default.

```css
--space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
--space-5: 24px; --space-6: 32px;
--radius-sm: 3px; --radius-md: 6px; /* deliberately NOT the 12-16px "friendly SaaS" radius */
```

Tight, consistent spacing throughout — this is a monitoring surface meant to show many true facts on one screen, not a marketing page with generous whitespace.

## 5. Semantic status colors

One meaning per color, used nowhere else, so color always carries the same information:

| Color | Token | Means | Used for |
|---|---|---|---|
| Green | `--color-positive` | accepted / connected / active / correct | accepted bid flash, "connected" badge, "active" auction badge, correctness-verified indicator |
| Red | `--color-negative` | rejected / disconnected / error / ended | rejection toast, "disconnected" badge, form errors, "ended" auction badge (paired with a distinct icon, not color alone — see §11) |
| Amber | `--color-warning` | reconnecting / ending soon / degraded | "reconnecting" badge, countdown under 60s, partial health (e.g. DB up, Redis down) |
| Blue | `--color-info` | neutral live activity | new-bid-row highlight in the live feed (a bid that's neither yours nor a rejection) |

Per the `ux` search result on live badges: a status change is announced as **one atomic, meaningful sentence** (`"Connected to auction"`, `"Bid rejected: too low"`), never a bare re-announced number — and color is never the only signal (an icon or text label always accompanies it, for colorblind users and for the accessibility risk the chart search explicitly flagged: "do not rely on color alone").

## 6. Buttons

- **Primary** (`Place Bid`, `Create Auction`): solid `--color-accent` fill, `--color-text-on-accent` text. One per view — there is only ever one primary action.
- **Secondary**: transparent fill, `--color-border` outline, `--color-text` text.
- **Destructive**: solid `--color-negative` fill — reserved for genuinely destructive actions only (none exist yet in the current scope).
- Minimum 44×44px hit target (accessibility checklist), `--radius-sm`, visible focus ring (`--color-focus-ring`, 2px offset outline — never `outline: none` without a replacement), hover/active states transition over 150ms, disabled state is a reduced-opacity solid, never a color swap.

## 7. Inputs

Dark `--color-surface` fill, 1px `--color-border`, label always visible above the field (never placeholder-as-label — a flagged anti-pattern). Bid-amount inputs use `Fira Code` with `tabular-nums`. Validation errors render as text directly under the field, paired with a red left border on the input itself — never a color-only signal, per §5's rule and the forms-and-feedback guidance ("Errors near field," not only at the top of the form).

## 8. Tables

Dense rows (`--text-sm`, `--space-2` vertical padding), right-aligned numeric columns in `Fira Code`, sticky header in `--color-surface-raised`. On narrow viewports, tables scroll horizontally inside a bounded wrapper rather than breaking the page layout (the exact fix the `ux` search returned for "tables overflow on mobile"). New rows (a fresh bid arriving live) insert at the top with a brief `--color-info` background fade-out over 600ms — the only animation a table ever has, and it only fires on a real event.

## 9. Live price indicators

The current-price display is the single highest-priority element on the Live Auction page (`--text-2xl`, `Fira Code`, `tabular-nums`). On a real price change (a genuine `bid_accepted` WebSocket event, never a poll or a guess), it flashes `--color-positive` as a background for 400ms and fades — a real-state-driven pulse, not a decorative loop. This matches the `chart` search's "Real-Time Streaming" color guidance (a distinct "current pulse" color against a dark background) applied to a single number instead of a chart, since a full streaming chart is overkill for "one price, updated occasionally" — see §10 for where an actual chart is warranted.

## 10. Charts

Per the `chart` search results, a chart is justified only for genuine time-series data a user needs to read trends from — not decoration. NeuraBid has exactly one legitimate case: **bid price history over time within a single auction.** That gets a minimal **sparkline** (a hand-rolled inline SVG line, no charting library — the data volume is a handful to a few dozen points per auction, well under any threshold that would justify a dependency), styled per the streaming-chart color guidance: current point in `--color-positive`, historical points fading toward `--color-text-muted`. No OHLC/candlestick chart is used — that pattern is explicitly for markets with actual Open/High/Low/Close data, which a single-item auction doesn't have; using it anyway would be exactly the "meaningless chart" the anti-slop brief warns against. The Admin Command Center (Phase 7) reuses the same sparkline primitive for bids/sec-over-time, when that's actually measured.

## 11. Badges

Small, solid-fill (not outline — outline badges are harder to read from a distance), uppercase, `--text-xs`, always icon+text or label+text — never a color dot alone. Two badge families:

- **Auction status:** `ACTIVE` (green), `ENDED` (red, paired with a stop-icon, not just color, since red-alone conflicts with a colorblind user's ability to distinguish it from a rejection toast), `SCHEDULED` (neutral gray).
- **Connection status:** see §12 — its own component, since it needs a live-updating icon, not just a static badge.

## 12. Connection indicators

The most important non-price element on the Live Auction page — a user must always be able to tell, at a glance, whether what they're looking at is live. States, each with a distinct icon (not color-only) and exact text:

| State | Color | Icon | Text |
|---|---|---|---|
| Connecting | amber | pulsing dot | "Connecting…" |
| Connected | green | solid dot | "Live" |
| Reconnecting | amber | spinning arrow | "Reconnecting…" |
| Disconnected | red | slashed dot | "Disconnected" |

Rendered as `role="status" aria-live="polite"` with one atomic text change per transition — matching the accessibility search result exactly (announce "Live", not "connected: true").

## 13. Motion rules

Per the `--motion 4` (Standard) dial and the accessibility checklist's `prefers-reduced-motion` requirement:

- **Every animation must be triggered by a real state change** — a bid arriving, a connection dropping, a countdown ticking. Nothing plays on load "for polish," and nothing loops.
- Durations: micro-feedback (button hover, focus) 150ms; state transitions (price flash, badge change) 300-400ms; new-row insertion 600ms. No animation exceeds 600ms.
- `@media (prefers-reduced-motion: reduce)` disables all non-essential motion (flashes, slides) and shows the end state immediately — connection/price *changes* still update instantly, only the decorative transition is removed.
- No auto-playing loops, no parallax, no scroll-triggered reveals (there is minimal scrolling on a dashboard in the first place).

## 14. Responsive behavior

Breakpoints per the checklist: `375px` (mobile), `768px` (tablet), `1024px` (laptop), `1440px` (projector/desktop — the actual primary target for a hackathon demo). Mobile-first CSS; no fixed pixel container widths; tables get the horizontal-scroll treatment from §8 below `768px`; the Live Auction page's layout collapses from a two-column (price+form / bid history) to single-column stack below `1024px`.

## 15. Accessibility rules

Non-negotiable, all sourced directly from the `ui-ux-pro-max` priority-1/2 categories (Accessibility and Touch & Interaction are the two CRITICAL-impact categories in its own ranking):

- Minimum contrast 4.5:1 for all text (verified against the palette above — `--color-text` on `--color-background` and `--color-surface` both clear this by a wide margin; `--color-text-muted` was chosen specifically to still clear 4.5:1 on both surfaces).
- Every interactive element ≥44×44px with a visible focus ring; never `outline: none` without a replacement.
- Color is never the sole carrier of meaning (every status pairs a color with text and/or an icon).
- Live regions (`role="status"`, `aria-live="polite"`) for connection state and bid outcome, announcing one complete sentence, not a bare value.
- All icons are SVG (Lucide-style), never emoji — emoji-as-icons is an explicit anti-pattern in the source checklist.

## 16. Component hierarchy

```
tokens (CSS custom properties, §2–4)
  └─ primitives          (frontend/src/components/ui/)
       Button, Input, Badge, ConnectionStatus, PriceDisplay, Sparkline, Table
  └─ composite components (frontend/src/components/)
       BidForm, BidHistoryTable, CountdownTimer, AuctionCard
  └─ pages                (frontend/src/pages/, Phase 6)
       Landing, Login, Marketplace, LiveAuction, CreateAuction, BidHistory
  └─ admin surface        (frontend/src/pages/Admin.tsx, Phase 7)
       reuses every primitive/composite above — no separate admin-only design language
```

Nothing above a primitive is styled with one-off inline colors — every visual decision routes through the tokens in §2–4, so changing the palette later is a token edit, not a find-and-replace across components.

## 17. What's substituted, and what's still generic-risk

- `frontend-design` and `impeccable` (named in the phase brief) do not exist as installed skills in this environment — `ui-ux-pro-max` and `unslop-ui` were used instead, and every color/type/pattern claim above cites which search produced it, so this can be re-verified rather than taken on faith.
- This document defines the system; it does not itself prove the implementation avoids every tell. Once shared components exist, running `unslop-ui`'s scanner (`devibe_scan.py`) against `frontend/src` is the actual verification step — planned as part of Phase 6/7 delivery, not skipped.
