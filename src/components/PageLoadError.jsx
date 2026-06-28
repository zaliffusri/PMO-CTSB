import UiEmptyState from './UiEmptyState';

export default function PageLoadError({ title = 'Could not load data', message, onRetry }) {
  return (
    <div className="page-module">
      <div className="card section-card">
        <UiEmptyState
          title={title}
          description={message || 'Check your connection and try again. If this persists, contact your administrator.'}
          action={onRetry ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>Retry</button>
          ) : null}
        />
      </div>
    </div>
  );
}
