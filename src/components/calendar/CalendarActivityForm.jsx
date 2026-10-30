import { Link } from 'react-router-dom';
import { inputStyle } from '../../styles/commonStyles';
import { ACTIVITY_LOCATION_OTHERS } from '../../constants/activityLocations';
import { ACTIVITY_TYPE_OPTIONS } from '../../utils/calendarUtils.js';
import { ATTACHMENT_IMAGE_ACCEPT } from '../../../lib/attachmentConstants.js';
import EntityAttachments from '../EntityAttachments.jsx';
import ActivityLocationFields from './ActivityLocationFields.jsx';

export default function CalendarActivityForm({
  open,
  editingActivityId,
  form,
  setForm,
  filteredPeople,
  canSyncRoster,
  projects,
  activitySites,
  personSearch,
  setPersonSearch,
  togglePerson,
  onSubmit,
  onClose,
  mutating,
  pendingPhotos = [],
  onAddPendingPhotos,
  onRemovePendingPhoto,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-dialog modal-dialog--activity-log"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-log-modal-title"
      >
        <div className="modal-dialog-header">
          <h2 id="activity-log-modal-title" className="modal-dialog-title">
            {editingActivityId != null ? 'Edit activity' : 'Log activity'}
          </h2>
          <button type="button" className="modal-dialog-close" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>
        <form
          noValidate
          onSubmit={onSubmit}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}
        >
          <label style={{ gridColumn: '1 / -1' }}>
            Team roster (multi-select, optional if guests are listed below)
            <input
              type="text"
              value={personSearch}
              onChange={(e) => setPersonSearch(e.target.value)}
              placeholder="Search name or email..."
              style={inputStyle}
            />
            <div style={{ marginTop: '0.5rem', maxHeight: 180, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem', background: 'var(--bg)' }}>
              {filteredPeople.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  {personSearch.trim()
                    ? 'No matching team member.'
                    : (
                      <>
                        No linked team members yet.
                        {canSyncRoster ? (
                          <>
                            {' '}Open <Link to="/team">Team</Link> and use Sync from users, then reopen this form.
                          </>
                        ) : (
                          <> Ask a PMO/admin to sync the Team roster from users.</>
                        )}
                      </>
                    )}
                </div>
              ) : (
                filteredPeople.map((p) => (
                  <label key={p.id} style={{ display: 'block', marginBottom: '0.35rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.person_ids.includes(String(p.id))}
                      onChange={() => togglePerson(p.id)}
                      style={{ marginRight: 8 }}
                    />
                    {p.name}
                    {p.email ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}> · {p.email}</span>
                    ) : null}
                  </label>
                ))
              )}
            </div>
            <div style={{ marginTop: '0.35rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Selected: {form.person_ids.length}
            </div>
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Guests / others (no system account)
            <textarea
              value={form.external_attendees}
              onChange={(e) => setForm((f) => ({ ...f, external_attendees: e.target.value }))}
              rows={2}
              placeholder="Comma-separated names or emails (stored for the record; no login required)"
              style={inputStyle}
            />
          </label>
          <label>
            Project{' '}
            <select value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))} style={inputStyle}>
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type{' '}
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} style={inputStyle}>
              {ACTIVITY_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Title *{' '}
            <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required style={inputStyle} />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Description{' '}
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} style={inputStyle} />
          </label>
          <ActivityLocationFields
            siteLocations={activitySites}
            preset={form.locationPreset}
            other={form.locationOther}
            onPreset={(v) => setForm((f) => ({ ...f, locationPreset: v, locationOther: v === ACTIVITY_LOCATION_OTHERS ? f.locationOther : '' }))}
            onOther={(v) => setForm((f) => ({ ...f, locationOther: v }))}
          />
          <div className="calendar-activity-photos" style={{ gridColumn: '1 / -1' }}>
            {editingActivityId != null ? (
              <EntityAttachments
                entityType="activity"
                entityId={editingActivityId}
                title="Site photos"
                gallery
                allowLinks={false}
                accept={ATTACHMENT_IMAGE_ACCEPT}
                emptyHint="Add photos from the site visit, UAT, or outstation so the team can see what happened (max 2.5 MB each)."
              />
            ) : (
              <>
                <span className="form-field__label">Site photos</span>
                <p className="pmo-table-muted" style={{ margin: '0.25rem 0 0.5rem' }}>
                  Optional. Photos of the visit, site, or session so everyone can see what happened outside the office.
                </p>
                {pendingPhotos.length > 0 && (
                  <ul className="entity-attachments__list entity-attachments--gallery calendar-pending-photos">
                    {pendingPhotos.map((item, idx) => (
                      <li key={`${item.file.name}-${idx}`} className="entity-attachments__item">
                        {item.url
                          ? <img className="entity-attachments__thumb" src={item.url} alt="" />
                          : <span className="entity-attachments__icon" aria-hidden>IMG</span>}
                        <div className="entity-attachments__meta">
                          <span className="pmo-link-strong">{item.file.name}</span>
                        </div>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemovePendingPhoto?.(idx)} title="Remove">
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="btn btn-secondary btn-sm entity-attachments__upload-btn">
                  + Add photo
                  <input
                    type="file"
                    accept={ATTACHMENT_IMAGE_ACCEPT}
                    className="sr-only"
                    multiple
                    onChange={(e) => {
                      const files = [...(e.target.files || [])];
                      e.target.value = '';
                      if (files.length) onAddPendingPhotos?.(files);
                    }}
                  />
                </label>
              </>
            )}
          </div>
          <label>
            Start *{' '}
            <input type="datetime-local" value={form.start_at} onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))} required style={inputStyle} />
          </label>
          <label>
            End *{' '}
            <input type="datetime-local" value={form.end_at} onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))} required style={inputStyle} />
          </label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            <button type="submit" className="btn btn-primary" disabled={mutating}>
              {mutating ? 'Saving…' : editingActivityId != null ? 'Update activity' : 'Save activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
