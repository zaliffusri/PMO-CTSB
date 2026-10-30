import { useEffect, useState } from 'react';
import { api } from '../api';
import { RAID_KINDS, RAID_STATUSES, RAID_IMPACTS } from '../../lib/raidConstants.js';
import { useLocale } from '../context/LocaleContext';

const EMPTY = { kind: 'risk', title: '', impact: 'medium', status: 'open', mitigation: '', owner_person_id: '' };

export default function ProjectRaidPanel({ projectId, people = [], canManage }) {
  const { t } = useLocale();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY);

  const load = () => api.raid.list(projectId).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, [projectId]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.raid.create({
        ...form,
        project_id: projectId,
        owner_person_id: form.owner_person_id ? +form.owner_person_id : null,
      });
      setForm(EMPTY);
      load();
    } catch (err) {
      alert(err.message || 'Could not add RAID item');
    }
  };

  return (
    <div className="project-raid-panel">
      <h2 className="section-card__title">{t('raid.title')}</h2>
      <p className="pmo-data-list__meta">{t('raid.hint')}</p>
      {canManage && (
        <form className="project-raid-form" onSubmit={submit}>
          <select className="form-field__input" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
            {RAID_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <input className="form-field__input" placeholder={t('common.title')} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
          <select className="form-field__input" value={form.impact} onChange={(e) => setForm((f) => ({ ...f, impact: e.target.value }))}>
            {RAID_IMPACTS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <select className="form-field__input" value={form.owner_person_id} onChange={(e) => setForm((f) => ({ ...f, owner_person_id: e.target.value }))}>
            <option value="">{t('raid.owner')}</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="submit" className="btn btn-primary btn-sm">{t('raid.add')}</button>
        </form>
      )}
      <table className="pmo-data-list">
        <thead>
          <tr>
            <th>{t('raid.kind')}</th>
            <th>{t('common.title')}</th>
            <th>{t('raid.impact')}</th>
            <th>{t('common.status')}</th>
            <th>{t('raid.owner')}</th>
            {canManage && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.kind}</td>
              <td>{r.title}</td>
              <td>{r.impact}</td>
              <td>
                {canManage ? (
                  <select
                    className="pmo-cell-select"
                    value={r.status}
                    onChange={async (e) => { await api.raid.update(r.id, { status: e.target.value }); load(); }}
                  >
                    {RAID_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                ) : r.status}
              </td>
              <td>{r.owner_name || '—'}</td>
              {canManage && (
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await api.raid.delete(r.id); load(); }}>{t('action.delete')}</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
