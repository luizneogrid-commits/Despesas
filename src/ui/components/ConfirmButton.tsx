import { useState, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  prompt?: string;
  ariaLabel?: string;
}

/** Confirmação em dois passos dentro da própria página (sem window.confirm). */
export function ConfirmButton({
  children,
  confirmLabel,
  onConfirm,
  className,
  prompt,
  ariaLabel,
}: Props) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        type="button"
        className={className ?? 'btn btn--danger btn--sm'}
        onClick={() => setAsking(true)}
        {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      >
        {children}
      </button>
    );
  }
  return (
    <span className="row-actions" role="group" aria-label={prompt ?? 'Confirmar'}>
      {prompt && (
        <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
          {prompt}
        </span>
      )}
      <button
        type="button"
        className="btn btn--danger-solid btn--sm"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        autoFocus
      >
        {confirmLabel}
      </button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAsking(false)}>
        Cancelar
      </button>
    </span>
  );
}
