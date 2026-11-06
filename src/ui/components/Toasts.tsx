import { X } from 'lucide-react';
import { useUiStore } from '../uiStore';

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <p>{t.message}</p>
          {t.action && (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => {
                t.action?.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label="Fechar aviso"
            onClick={() => dismiss(t.id)}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
