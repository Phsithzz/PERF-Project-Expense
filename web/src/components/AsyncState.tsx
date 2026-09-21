interface StateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function FullPageLoader({ label }: { label: string }) {
  return (
    <main className="centered-page" aria-busy="true" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </main>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state-panel" aria-busy="true" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({
  title,
  message,
  actionLabel = "Try again",
  onAction,
}: StateProps) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      {onAction ? (
        <button
          className="button button--secondary"
          type="button"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: StateProps) {
  return (
    <div className="state-panel">
      <div className="empty-icon" aria-hidden="true">
        ฿
      </div>
      <h2>{title}</h2>
      <p>{message}</p>
      {actionLabel && onAction ? (
        <button className="button" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
