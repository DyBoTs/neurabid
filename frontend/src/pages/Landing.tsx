import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { LiveAuctionPreview } from '../components/LiveAuctionPreview';
import styles from './Landing.module.css';

const FEATURES = [
  {
    title: 'Live Bidding',
    body: 'See new bids instantly without refreshing the page.',
  },
  {
    title: 'Fair & Secure',
    body: 'Every bid is checked against the latest auction state before it is accepted.',
  },
  {
    title: 'Built for High Traffic',
    body: 'Designed to stay responsive even when many people bid at once.',
  },
];

const STEPS = [
  {
    number: '01',
    title: 'Browse',
    body: 'Discover live auctions and choose what you want to bid on.',
  },
  {
    number: '02',
    title: 'Bid Live',
    body: 'Place your bid and see competing bids update instantly.',
  },
  {
    number: '03',
    title: 'Win With Confidence',
    body: 'Your bid is validated against the latest auction state.',
  },
];

const VALUES = [
  {
    title: 'Real-Time',
    body: 'Everyone sees the latest auction state instantly.',
  },
  {
    title: 'Consistent',
    body: 'Bids are validated against the authoritative auction state.',
  },
  {
    title: 'Reliable',
    body: 'Designed to remain dependable when bidding activity spikes.',
  },
];

/**
 * No fabricated stats or marketing copy here (per the project's anti-slop
 * rules): the hero's live preview is the real product, not a mockup — see
 * components/LiveAuctionPreview.tsx.
 */
export function LandingPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.eyebrow}>Real-Time Auctions • Built for Scale</span>
          <h1 className={styles.headline}>
            Bid live.
            <br />
            Compete fairly.
            <br />
            Stay in sync.
          </h1>
          <p className={styles.subcopy}>
            NeuraBid is a real-time auction platform where every bid is checked against the
            latest auction state and every bidder watching sees it the instant it's accepted —
            no refreshing, no guessing.
          </p>
          <div className={styles.actions}>
            <Link to="/marketplace">
              <Button>Browse Live Auctions</Button>
            </Link>
            <Link to="/create">
              <Button variant="secondary">Create an Auction</Button>
            </Link>
          </div>
          <ul className={styles.trustList}>
            <li>Instant bid updates</li>
            <li>Every bid validated</li>
            <li>No page refresh needed</li>
          </ul>
        </div>

        <LiveAuctionPreview />
      </section>

      <section className={styles.features}>
        <h2 className={styles.srOnly}>What you get</h2>
        {FEATURES.map((feature) => (
          <div key={feature.title} className={styles.featureCard}>
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
          </div>
        ))}
      </section>

      <section className={styles.steps}>
        <h2 className={styles.sectionHeading}>How NeuraBid Works</h2>
        <div className={styles.stepsGrid}>
          {STEPS.map((step) => (
            <div key={step.number} className={styles.step}>
              <span className={styles.stepNumber}>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.values}>
        <h2 className={styles.sectionHeading}>Built for Fast-Moving Auctions</h2>
        <div className={styles.valuesGrid}>
          {VALUES.map((value) => (
            <div key={value.title} className={styles.valueCard}>
              <h3>{value.title}</h3>
              <p>{value.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <span className={styles.footerBrand}>NeuraBid</span>
        <span className={styles.footerTagline}>Real-time auctions, built for scale.</span>
      </footer>
    </div>
  );
}
