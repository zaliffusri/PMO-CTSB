export default function UiEmptyState({ title, description, action }) {
  return (
    <div className="ui-empty-state">
      {title && <p className="ui-empty-state__title">{title}</p>}
      {description && <div className="ui-empty-state__desc">{description}</div>}
      {action && <div className="ui-empty-state__action">{action}</div>}
    </div>
  );
}
