import { Modal } from './ui/Modal';
import styles from './AboutModal.module.css';

const TEAM = ['Rishi', 'Dishant', 'Shibom', 'Sweta', 'Dibya'];

export function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="About NeuraBid">
      <p className={styles.intro}>
        NeuraBid is a real-time auction platform built to prove that concurrent bidding can be handled
        correctly — every bid checked against the database, not against a guess.
      </p>
      <h3 className={styles.teamHeading}>Team</h3>
      <ul className={styles.teamList}>
        {TEAM.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </Modal>
  );
}
