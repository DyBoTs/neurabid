import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * A thin wrapper around the native <dialog> element rather than a
 * hand-rolled overlay: the browser already provides focus trapping,
 * Escape-to-close, and a backdrop for free, with no extra dependency and
 * no risk of getting any of that subtly wrong.
 */
export function Modal({ open, onClose, title, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="modal-title"
    >
      <div className={styles.header}>
        <h2 id="modal-title" className={styles.title}>
          {title}
        </h2>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
