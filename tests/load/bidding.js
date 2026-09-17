import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// k6's built-in http_req_failed metric treats any non-2xx/3xx response as
// "failed" by default. A 409 "bid too low" is a CORRECT response from a
// working system, not a failure — without this, http_req_failed would
// (and, in an earlier draft of this script, actually did) report ~75%
// "failures" purely from expected business rejections, which would have
// been a fake/misleading result. This tells k6 exactly which status
// codes are expected — 200 for setup()'s user creation, 201 for both
// auction creation and an accepted bid, and the real business-rejection
// codes a bid can get back — so http_req_failed only reflects genuine
// errors (5xx, network failures, an unexpected status).
http.setResponseCallback(http.expectedStatuses(200, 201, 400, 403, 409, 410));

/**
 * NeuraBid load test — hits the REAL bid endpoint on a REAL running
 * backend + Postgres. See docs/08-load-testing.md for what every term
 * here (VU, req/sec, p95/p99) actually means, and tests/load/README.md
 * for how to run this.
 *
 * This one file has 5 stage configs (see STAGES below). Run one stage at
 * a time via the STAGE env var:
 *   k6 run -e STAGE=1 tests/load/bidding.js
 *   k6 run -e STAGE=2 tests/load/bidding.js
 *   ...
 * tests/load/run-all.sh runs all 5 in order, with the real database
 * correctness checker (tests/load/check-correctness.mjs) run after each
 * one — never skipped, never faked.
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

// --- Custom metrics, tagged onto the actual bid POST call only (not the
// setup requests) so "request rate"/"latency" below describe the bid
// endpoint specifically, not the whole test's HTTP traffic. ---
const bidLatency = new Trend('bid_latency_ms', true);
const bidsAccepted = new Counter('bids_accepted');
const bidsRejected = new Counter('bids_rejected');
const bidsHttpErrors = new Counter('bids_http_errors');

// --- Stage definitions, exactly the 5 requested ---
const STAGES = {
  // 1. Small correctness run: light concurrency, just enough to prove the
  //    pipeline (create → bid → verify) actually works before scaling up.
  1: {
    name: 'small correctness run',
    poolSize: 3,
    scenario: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 5 },
        { duration: '10s', target: 5 },
        { duration: '3s', target: 0 },
      ],
    },
  },
  // 2. 100 concurrent users
  2: {
    name: '100 concurrent users',
    poolSize: 10,
    scenario: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 },
        { duration: '20s', target: 100 },
        { duration: '5s', target: 0 },
      ],
    },
  },
  // 3. 500 concurrent users
  3: {
    name: '500 concurrent users',
    poolSize: 25,
    scenario: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 500 },
        { duration: '20s', target: 500 },
        { duration: '5s', target: 0 },
      ],
    },
  },
  // 4. 1000 concurrent users
  4: {
    name: '1000 concurrent users',
    poolSize: 50,
    scenario: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 1000 },
        { duration: '20s', target: 1000 },
        { duration: '5s', target: 0 },
      ],
    },
  },
  // 5. Attempt ~5000 req/sec, open-model (arrival-rate, not VU-count) —
  //    the honest way to test "can it sustain a request rate" rather
  //    than "what happens with N users each looping as fast as they can".
  //    If the machine can't sustain this, k6 reports dropped iterations
  //    and the real achieved rate — that's the actual result, not a
  //    failure to hide (see docs/08-load-testing.md).
  5: {
    name: 'attempt ~5000 req/sec',
    poolSize: 100,
    scenario: {
      executor: 'ramping-arrival-rate',
      startRate: 200,
      timeUnit: '1s',
      preAllocatedVUs: 300,
      maxVUs: 1500,
      stages: [
        { duration: '10s', target: 2000 },
        { duration: '10s', target: 5000 },
        { duration: '15s', target: 5000 },
        { duration: '5s', target: 0 },
      ],
    },
  },
};

const stageId = __ENV.STAGE || '1';
const stage = STAGES[stageId];
if (!stage) {
  throw new Error(`Unknown STAGE "${stageId}" — must be 1-5`);
}

export const options = {
  scenarios: { bidding: stage.scenario },
  // k6's default summary only shows p90/p95 — add p99 explicitly so it's
  // always visible without extra flags.
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(95)', 'p(99)'],
  thresholds: {
    // A "failed" HTTP request here means a genuine network/5xx error —
    // a 409 "bid too low" is a correct, successful response and never
    // counts as a threshold failure (see the check() below).
    http_req_failed: ['rate<0.05'],
  },
};

/**
 * setup() runs once before any VU starts. It creates this stage's own
 * pool of real auctions/users via the real REST API — never seeded
 * directly into the database — so the load test exercises the exact
 * same code path a real user would.
 */
export function setup() {
  const users = [];
  for (let i = 0; i < 20; i++) {
    const res = http.post(
      `${BASE_URL}/api/users`,
      JSON.stringify({ username: `k6_${stageId}_${Date.now()}_${i}` }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (res.status === 200) users.push(res.json('id'));
  }

  const auctions = [];
  for (let i = 0; i < stage.poolSize; i++) {
    const res = http.post(
      `${BASE_URL}/api/auctions`,
      JSON.stringify({
        title: `k6 load test auction ${stageId}-${i}`,
        startingPrice: 100,
        minIncrement: 1,
        durationMinutes: 30,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (res.status === 201) {
      auctions.push({ id: res.json('id'), startingPrice: 100 });
    }
  }

  if (auctions.length === 0 || users.length === 0) {
    throw new Error(
      `setup() failed to create test data (auctions=${auctions.length}, users=${users.length}) — is the backend running at ${BASE_URL}?`,
    );
  }

  console.log(
    `[stage ${stageId}: ${stage.name}] setup complete — ${auctions.length} auctions, ${users.length} users`,
  );
  return { auctions, users, testStart: Date.now() };
}

export default function (data) {
  const { auctions, users, testStart } = data;
  const auction = auctions[Math.floor(Math.random() * auctions.length)];
  const userId = users[Math.floor(Math.random() * users.length)];

  // A monotonically-increasing-over-real-time amount, with a little
  // jitter: bids attempted seconds apart tend to succeed; bids that land
  // within the same ~50ms window on the same auction genuinely race, and
  // only one can win — real contention, not simulated.
  const amount = auction.startingPrice + Math.floor((Date.now() - testStart) / 50) + Math.floor(Math.random() * 20);

  const res = http.post(
    `${BASE_URL}/api/auctions/${auction.id}/bids`,
    JSON.stringify({ amount }),
    { headers: { 'Content-Type': 'application/json', 'X-User-Id': userId } },
  );

  bidLatency.add(res.timings.duration);

  const isServerError = res.status >= 500 || res.status === 0;
  if (isServerError) bidsHttpErrors.add(1);

  check(res, {
    'response is 201 (accepted) or a real business rejection (400/403/409/410)': (r) =>
      r.status === 201 || [400, 403, 409, 410].includes(r.status),
  });

  if (res.status === 201) {
    bidsAccepted.add(1);
  } else if ([400, 403, 409, 410].includes(res.status)) {
    bidsRejected.add(1);
  }

  sleep(0.05);
}

export function teardown(data) {
  console.log(
    `[stage ${stageId}: ${stage.name}] done — run tests/load/check-correctness.mjs now before trusting these numbers.`,
  );
}
