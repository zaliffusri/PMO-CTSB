export default function PageLoadingState({ message = 'Loading…' }) {
  return (
    <div className="page-module">
      <div className="page-loading" role="status" aria-live="polite">
        {message}
      </div>
    </div>
  );
}
