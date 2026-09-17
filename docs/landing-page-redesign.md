# Landing Page Redesign

This document covers a single, scoped change: the public landing page (`/`). No bid
logic, transaction logic, PostgreSQL/Redis logic, WebSocket architecture, or API
contracts were touched — the only backend-adjacent change is that the hero's live
preview panel *reads* existing endpoints (`GET /api/auctions`, `GET /api/auctions/:id/bids`)
that already powered the Marketplace and Live Auction pages.

## Old problems

The previous landing page (`frontend/src/pages/Landing.tsx`) was a single left-aligned
column capped at 640px, leaving most of the viewport empty, and its copy was written for
a code reviewer, not a visitor:

- The three "feature" cards were named **"Locking, not luck"**, **"Live, not polled"**,
  and **"Tested under real load"**, with body text that literally said *"see
  docs/03-bid-engine.md"*, *"see docs/05-realtime.md"*, *"see docs/04-concurrency-testing.md"*.
- The hero paragraph led with "PostgreSQL — not the client, not a cache — decides
  whether a bid wins," which assumes the reader already cares about the architecture.
- The navigation always showed **Admin** to every visitor, logged in or not, and showed
  whichever raw username happened to be stored in the browser (e.g. a leftover test
  account) with no visual distinction from a real account.
- Nothing on the page told a first-time visitor what to do first.

## New design direction

No new color palette, font, or spacing scale was introduced — every value in the new
CSS is one of the existing tokens in `frontend/src/styles/tokens.css` (the same dark
navy/charcoal surfaces, the same single green accent, the same Fira Sans/Fira Code
pair, the same spacing and motion-duration scale used everywhere else in the app). The
redesign is a **composition and copy change**, not a re-skin — consistent with this
project's existing "no AI-slop UI" rule ([[workflow-preferences]]): `unslop-ui`'s
scanner was run against the whole `frontend/src` tree afterward and returned 0 findings
(57 → 59 files scanned, vibe score 0).

The `ui-ux-pro-max` skill's `landing` domain was queried for a real-time/live-preview
product's expected section order (`real-time-operations-landing` pattern: hero with
live preview → key indicators → how it works → CTA) — the final page follows that
order, and that same lookup's guidance ("label telemetry as live only when backed by a
current source... render a static final state under reduced motion") is exactly why the
hero's live panel is wired to real data rather than a static mockup.

## What changed

### Hero — two columns, not one

`frontend/src/pages/Landing.tsx` + `Landing.module.css`: a CSS grid (`1.05fr / 0.95fr`,
collapsing to a single column at 768px) replaces the old 640px-capped single column.
Left side: eyebrow, headline, supporting paragraph, primary + secondary CTA, three
small trust indicators. Right side: the new `LiveAuctionPreview` component (see below).
Because the live preview panel is the *last* element in the source order on the left
side's content flow, the mobile stacked order falls out naturally without any CSS
`order` overrides: headline → paragraph → CTAs → trust indicators → live preview →
feature cards, matching the mobile order the brief called for.

### The hero's live preview is real, not a mockup

`frontend/src/components/LiveAuctionPreview.tsx` (new) fetches the real auction list,
picks whichever **active** auction is ending soonest, and renders it using the exact
same building blocks the real Live Auction page uses: `PriceDisplay` (with its
existing genuine-change-only flash animation), `CountdownTimer` (ticking against the
auction's real `endsAt`), `ConnectionStatus` (subscribed to that auction's real
WebSocket via `useAuctionSocket`), and `BidHistoryTable` (showing up to 3 real recent
bids). If no auction is currently active, the panel says so explicitly and links to the
Marketplace instead of inventing a placeholder auction. Clicking **Place a Bid**
navigates to that auction's real page — the panel is a preview of the product, not a
second, fake bidding form.

### Three feature cards replaced

The old **"Locking, not luck" / "Live, not polled" / "Tested under real load"** cards
(with their doc-file references) are gone, replaced by **Live Bidding / Fair & Secure /
Built for High Traffic**, each with one plain-language sentence and no mention of
Postgres, Redis, WebSockets, row locks, or filenames.

### Two new sections

- **"How NeuraBid Works"** — a compact 3-step strip (Browse → Bid Live → Win With
  Confidence).
- **"Built for Fast-Moving Auctions"** — three short value statements (Real-Time /
  Consistent / Reliable), the plain-language version of the technical guarantees
  covered in depth in `docs/03-bid-engine.md` and `docs/04-concurrency-testing.md` (those
  docs are still the right place for the engineering explanation — they're just no
  longer duplicated, badly, on the landing page).

A minimal footer (brand + one tagline) was added; no fabricated legal/social links were
added, since none of those pages exist.

### Navigation

`frontend/src/components/Layout.tsx` + `Layout.module.css`:

- **Admin** now only appears in the nav once a user is logged in, matching the existing
  pattern for **My Bids**. This app has no role/permission system at all
  ([[hard-constraints]] — auth is an intentional "pick a username" simplification), so
  this is a nav-visibility change only, not new access control — the `/admin` route
  itself is unchanged and still reachable directly by URL either way. The code comment
  in `Layout.tsx` says this explicitly so it isn't mistaken for a security boundary
  later.
- Active nav links now get a small animated underline (an existing `--duration-state`
  token drives the transition) instead of relying on color alone.
- The logged-in username + Log out control were grouped into one `.account` block with
  a border separator and a proper bordered button for Log out, instead of a bare
  text link.
- The stray **"keyboard_test_user"** visible in an earlier screenshot was leftover
  browser state from manual testing, not hardcoded content — the nav always renders
  whichever user is actually logged in. It disappears the moment that account logs out
  (verified live) and doesn't reappear against a freshly seeded database.

## Sections removed

- The old single-column hero and its 640px cap.
- All three "implementation-focused" fact cards and every doc-file reference on the
  page.
- The always-visible **Admin** nav link for anonymous visitors.

## Sections added

- Hero right-side live preview panel.
- "How NeuraBid Works" (3 steps).
- "Built for Fast-Moving Auctions" (3 values).
- Landing page footer.

## Accessibility

- Heading order is now a clean `h1 → h2 → h3` all the way down. The feature-card grid
  didn't have a heading of its own in the brief's copy, so a visually-hidden `<h2>`
  ("What you get") was added purely to keep the outline correct for screen-reader users
  — it changes nothing visually.
- Text contrast was checked against the actual token values used: muted text
  (`--color-text-muted` on `--color-background`) and the green eyebrow/accent text both
  measure well past WCAG AA (see `docs/10-final-audit.md`'s contrast note for the muted
  pairing; the accent-on-background pairing used for the eyebrow computes to ~8.85:1).
- Keyboard focus: no new interactive elements bypass the app's global
  `:focus-visible` outline (`frontend/src/index.css`); verified by tabbing through the
  hero's CTAs and the live preview's "Place a Bid" link.
- All motion (nav underline, `PriceDisplay`'s flash, `BidHistoryTable`'s insert
  highlight) is driven by the existing `--duration-*` tokens, which are already zeroed
  under `prefers-reduced-motion: reduce` — no new animation had to special-case motion
  sensitivity because none of it is bespoke.
- Every button has a plain-text label (no icon-only controls were introduced).

## Responsive behavior

- **Desktop:** two-column hero (grid `1.05fr / 0.95fr`).
- **Tablet (≤1024px):** same two-column layout, reduced gap/padding only.
- **Mobile (≤768px):** hero collapses to one column; because the live preview panel is
  the last element after the CTAs in source order, it naturally lands in the
  brief's requested order (headline → paragraph → primary CTA → secondary CTA → live
  preview → feature cards) with no `order` hacks. CTA buttons stretch full-width below
  768px. The live preview panel's price/time-left row wraps instead of overflowing on
  very narrow phones.

## Verification

- `unslop-ui` scan: 59 files, 0 findings, vibe score 0.
- Frontend lint (`oxlint`): clean (one pre-existing, unrelated warning in
  `useAuth.tsx`).
- Typecheck (`tsc -b`): clean.
- Frontend test suite: 20/20 passing. `App.test.tsx`'s root-route smoke test was updated
  to check for the new hero heading (`/bid live/i`, disambiguated to `level: 1` since
  the new "Bid Live" step heading in "How NeuraBid Works" would otherwise also match) —
  this is an intentional content change, not a regression the test papered over.
- Production build (`vite build`): succeeds, `dist/assets/index-*.js` 292.92 kB
  (91.43 kB gzip).
- Verified live in the browser: hero renders correctly, the live preview panel shows a
  real seeded auction (Vintage Synthesizer, real price/countdown), logging out removes
  the stray test username and the Admin link from the nav immediately, and the active
  nav-link underline animates correctly when navigating to Marketplace.
