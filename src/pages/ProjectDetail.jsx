import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';

const card = { background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '1.25rem', border: '1px solid var(--border)' };

function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [people, setPeople] = useState([]);
  const [allPeople, setAllPeople] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ person_id: '', role_in_project: '' });
  const [tasks, setTasks] = useState([]);
  /** @type {null | 'group' | 'subtask' | 'standalone'} */
  const [taskAddMode, setTaskAddMode] = useState(null);
  const [taskForm, setTaskForm] = useState({
    name: '',
    parent_id: '',
    planned_start_date: '',
    planned_end_date: '',
    actual_start_date: '',
    actual_end_date: '',
    progress_percent: 0,
    status: 'new',
    assignee_id: '',
  });

  const taskGroups = useMemo(
    () => tasks.filter((t) => t.task_kind === 'group'),
    [tasks],
  );
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [allTags, setAllTags] = useState([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    status: 'active',
    client_id: '',
  });

  const load = () => {
    if (!id) return;
    Promise.all([api.projects.get(id), api.clients.list(), api.people.list(), api.projectTasks.list({ project_id: id })])
      .then(([p, clientsList, peopleList, taskList]) => {
        setProject(p);
        setClients(clientsList);
        setTags(Array.isArray(p.tags) ? [...p.tags] : []);
        setEditForm({
          name: p?.name || '',
          description: p?.description || '',
          status: p?.status || 'active',
          client_id: p?.client_id ?? '',
        });
        setAllPeople(peopleList);
        setPeople(peopleList.filter(pe => !p.members?.some(m => m.person_id === pe.id)));
        setTasks(taskList);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => { api.projects.tagsList().then(setAllTags).catch(console.error); }, []);

  const addAssignment = async (e) => {
    e.preventDefault();
    if (!assignForm.person_id) return;
    try {
      await api.assignments.create({
        project_id: +id,
        person_id: +assignForm.person_id,
        role_in_project: assignForm.role_in_project || undefined,
        allocation_percent: 100,
      });
      setAssignForm({ person_id: '', role_in_project: '' });
      setAssignOpen(false);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const removeAssignment = async (assignId) => {
    if (!confirm('Remove this team member from the project?')) return;
    try {
      await api.assignments.delete(assignId);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const resetTaskForm = () => {
    setTaskForm({
      name: '',
      parent_id: '',
      planned_start_date: '',
      planned_end_date: '',
      actual_start_date: '',
      actual_end_date: '',
      progress_percent: 0,
      status: 'new',
      assignee_id: '',
    });
  };

  const openTaskAdd = (mode) => {
    setTaskAddMode(mode);
    resetTaskForm();
    if (mode === 'subtask' && taskGroups.length > 0) {
      setTaskForm((f) => ({ ...f, parent_id: String(taskGroups[0].id) }));
    }
  };

  const closeTaskAdd = () => {
    setTaskAddMode(null);
    resetTaskForm();
  };

  const addTask = async (e) => {
    e.preventDefault();
    if (!taskForm.name.trim()) return;
    if (taskAddMode === 'subtask') {
      const pid = parseInt(String(taskForm.parent_id), 10);
      if (!Number.isFinite(pid) || pid < 1) {
        alert('Choose a task group (parent) for this subtask.');
        return;
      }
    }
    try {
      if (taskAddMode === 'group') {
        await api.projectTasks.create({
          project_id: +id,
          name: taskForm.name.trim(),
          task_kind: 'group',
          planned_start_date: taskForm.planned_start_date || undefined,
          planned_end_date: taskForm.planned_end_date || undefined,
        });
      } else if (taskAddMode === 'subtask') {
        const parentId = parseInt(String(taskForm.parent_id), 10);
        await api.projectTasks.create({
          project_id: +id,
          name: taskForm.name.trim(),
          task_kind: 'task',
          parent_id: parentId,
          planned_start_date: taskForm.planned_start_date || undefined,
          planned_end_date: taskForm.planned_end_date || undefined,
          actual_start_date: taskForm.actual_start_date || undefined,
          actual_end_date: taskForm.actual_end_date || undefined,
          progress_percent: taskForm.progress_percent ?? 0,
          status: taskForm.status || 'new',
          assignee_id: taskForm.assignee_id ? +taskForm.assignee_id : null,
        });
      } else {
        await api.projectTasks.create({
          project_id: +id,
          name: taskForm.name.trim(),
          task_kind: 'task',
          planned_start_date: taskForm.planned_start_date || undefined,
          planned_end_date: taskForm.planned_end_date || undefined,
          actual_start_date: taskForm.actual_start_date || undefined,
          actual_end_date: taskForm.actual_end_date || undefined,
          progress_percent: taskForm.progress_percent ?? 0,
          status: taskForm.status || 'new',
          assignee_id: taskForm.assignee_id ? +taskForm.assignee_id : null,
        });
      }
      closeTaskAdd();
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteTask = async (taskId, taskKind) => {
    const msg = taskKind === 'group'
      ? 'Delete this task group and all of its subtasks?'
      : 'Delete this task?';
    if (!confirm(msg)) return;
    try {
      await api.projectTasks.delete(taskId);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const patchTask = async (taskId, partial) => {
    try {
      await api.projectTasks.update(taskId, partial);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const addTag = (tag) => {
    const t = typeof tag === 'string' ? tag.trim() : tag;
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    setTags(next);
    if (typeof tag === 'string') setTagInput('');
    api.projects.update(id, { ...project, tags: next }).then(() => setProject(p => p ? { ...p, tags: next } : null)).catch(alert);
  };

  const removeTag = (t) => {
    const next = tags.filter(x => x !== t);
    setTags(next);
    api.projects.update(id, { ...project, tags: next }).then(() => setProject(p => p ? { ...p, tags: next } : null)).catch(alert);
  };

  const saveProjectEdit = async (e) => {
    e.preventDefault();
    try {
      const updated = await api.projects.update(id, {
        name: editForm.name,
        description: editForm.description || null,
        status: editForm.status,
        client_id: editForm.client_id ? +editForm.client_id : null,
      });
      setProject(updated);
      setEditOpen(false);
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading || !project) return <div style={{ padding: '2rem' }}>Loading...</div>;

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/projects" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>← Projects</Link>
      </div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>{project.name}</h1>
          {project.description && <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>{project.description}</p>}
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {project.client_name && <span>Client: {project.client_name} · </span>}Status: {project.status} {project.start_date && ` · ${project.start_date} – ${project.end_date || '–'}`}
          </p>
          {tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
              {tags.map(t => <span key={t} style={tagChip}>{t}</span>)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setAssignOpen(!assignOpen)} style={btnPrimary}>
            {assignOpen ? 'Cancel' : '+ Assign team member'}
          </button>
          <button type="button" onClick={() => setEditOpen(!editOpen)} style={btnSecondary}>
            {editOpen ? 'Cancel edit' : 'Edit project'}
          </button>
        </div>
      </div>

      {editOpen && (
        <div style={card}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Edit project</h2>
          <form onSubmit={saveProjectEdit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 520 }}>
            <label>
              Name <span style={{ color: 'var(--danger)' }}>*</span>
              <input
                type="text"
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                required
                style={inputStyle}
              />
            </label>
            <label>
              Description
              <textarea
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                style={inputStyle}
              />
            </label>
            <label>
              Status
              <select
                value={editForm.status}
                onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                style={inputStyle}
              >
                <option value="active">Active</option>
                <option value="on-hold">On hold</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label>
              Client
              <select
                value={editForm.client_id}
                onChange={e => setEditForm(f => ({ ...f, client_id: e.target.value }))}
                style={inputStyle}
              >
                <option value="">No client</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="submit" style={btnPrimary}>Save changes</button>
              <button type="button" style={btnSecondary} onClick={() => setEditOpen(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div style={card}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>Tags</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 0.5rem' }}>Group this project with others. Choose existing tags or type a new one.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
          {tags.map(t => (
            <span key={t} style={tagChip}>{t} <button type="button" onClick={() => removeTag(t)} aria-label="Remove" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0 0 0 4px', fontSize: '1rem' }}>×</button></span>
          ))}
          <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }} placeholder="Or type new tag, press Enter" style={{ ...inputStyle, width: 'auto', minWidth: 160, margin: 0 }} />
        </div>
        {(allTags.filter(t => !tags.includes(t))).length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Choose existing: </span>
            {allTags.filter(t => !tags.includes(t)).map(t => (
              <button key={t} type="button" onClick={() => addTag(t)} style={tagChipButton}>{t}</button>
            ))}
          </div>
        )}
      </div>

      {assignOpen && (
        <div style={{ ...card, marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem' }}>Assign team member</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Pick someone from the list. You can manage the full team on <Link to="/team">Team</Link>.
          </p>
          <form onSubmit={addAssignment} style={{ display: 'grid', gap: '0.75rem', maxWidth: 400 }}>
            <label>
              Person
              <select value={assignForm.person_id} onChange={e => setAssignForm(f => ({ ...f, person_id: e.target.value }))} required style={inputStyle}>
                <option value="">Select...</option>
                {people.map(p => (
                  <option key={p.id} value={p.id}>{p.name} {p.project_count > 0 ? `(${p.project_count} projects)` : ''}</option>
                ))}
              </select>
            </label>
            <label>
              Role in project
              <input type="text" value={assignForm.role_in_project} onChange={e => setAssignForm(f => ({ ...f, role_in_project: e.target.value }))} placeholder="e.g. Developer, Lead" style={inputStyle} />
            </label>
            <button type="submit" style={btnPrimary}>Assign</button>
          </form>
        </div>
      )}

      <div style={card}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Team assigned to this project</h2>
        {!project.members?.length ? (
          <p style={{ color: 'var(--text-muted)' }}>No one assigned yet. Use &quot;Assign team member&quot; to add people.</p>
        ) : (
          <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {project.members.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdStyle}>
                    <Link to="/team" style={{ color: 'var(--accent)' }}>{m.name}</Link>
                  </td>
                  <td style={tdStyle}>{m.role_in_project || '–'}</td>
                  <td style={tdStyle}>
                    <button type="button" onClick={() => removeAssignment(m.id)} style={{ ...btnSecondary, padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Tasks (Gantt)</h2>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: 560 }}>
              Use <strong>+ Task group</strong> first to create a parent row. Then use <strong>+ Subtask</strong> under that group (assignee only on subtasks). <strong>+ Standalone task</strong> is a normal task without a parent—those rows are not groups, so they do not unlock subtasks.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <Link to="/gantt" style={btnSecondary}>View Gantt</Link>
            <button type="button" onClick={() => (taskAddMode === 'group' ? closeTaskAdd() : openTaskAdd('group'))} style={btnPrimary}>
              {taskAddMode === 'group' ? 'Cancel' : '+ Task group'}
            </button>
            <button
              type="button"
              onClick={() => (taskAddMode === 'subtask' ? closeTaskAdd() : openTaskAdd('subtask'))}
              style={btnSecondary}
              disabled={taskGroups.length === 0}
              title={taskGroups.length === 0 ? 'Create a task group first' : undefined}
            >
              {taskAddMode === 'subtask' ? 'Cancel' : '+ Subtask'}
            </button>
            <button type="button" onClick={() => (taskAddMode === 'standalone' ? closeTaskAdd() : openTaskAdd('standalone'))} style={btnSecondary}>
              {taskAddMode === 'standalone' ? 'Cancel' : '+ Standalone task'}
            </button>
          </div>
        </div>
        {taskAddMode && (
          <form onSubmit={addTask} style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--surface-hover)', borderRadius: 8 }}>
            <h4 style={{ margin: '0 0 0.75rem' }}>
              {taskAddMode === 'group' && 'New task group (parent)'}
              {taskAddMode === 'subtask' && 'New subtask'}
              {taskAddMode === 'standalone' && 'New standalone task'}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
              {taskAddMode === 'subtask' && (
                <label style={{ gridColumn: '1 / -1' }}>
                  Task group (parent) <span style={{ color: 'var(--danger)' }}>*</span>
                  <select
                    value={taskForm.parent_id}
                    onChange={e => setTaskForm(f => ({ ...f, parent_id: e.target.value }))}
                    required
                    style={inputStyle}
                  >
                    <option value="">Select group…</option>
                    {taskGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label style={{ gridColumn: '1 / -1' }}>
                {taskAddMode === 'group' ? 'Group name' : 'Task name'} <span style={{ color: 'var(--danger)' }}>*</span>
                <input type="text" value={taskForm.name} onChange={e => setTaskForm(f => ({ ...f, name: e.target.value }))} required style={inputStyle} />
              </label>
              {(taskAddMode === 'subtask' || taskAddMode === 'standalone') && (
                <>
                  <label>
                    Assign to
                    <select value={taskForm.assignee_id} onChange={e => setTaskForm(f => ({ ...f, assignee_id: e.target.value }))} style={inputStyle}>
                      <option value="">Unassigned</option>
                      {allPeople.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Status
                    <select value={taskForm.status} onChange={e => setTaskForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
                      <option value="new">New</option>
                      <option value="ongoing">Ongoing</option>
                      <option value="done">Done</option>
                    </select>
                  </label>
                  <label>Progress % <input type="number" min={0} max={100} value={taskForm.progress_percent} onChange={e => setTaskForm(f => ({ ...f, progress_percent: +e.target.value || 0 }))} style={inputStyle} /></label>
                </>
              )}
              <label>Planned start <input type="date" value={taskForm.planned_start_date} onChange={e => setTaskForm(f => ({ ...f, planned_start_date: e.target.value }))} style={inputStyle} /></label>
              <label>Planned end <input type="date" value={taskForm.planned_end_date} onChange={e => setTaskForm(f => ({ ...f, planned_end_date: e.target.value }))} style={inputStyle} /></label>
              {(taskAddMode === 'subtask' || taskAddMode === 'standalone') && (
                <>
                  <label>Actual start <input type="date" value={taskForm.actual_start_date} onChange={e => setTaskForm(f => ({ ...f, actual_start_date: e.target.value }))} style={inputStyle} /></label>
                  <label>Actual end <input type="date" value={taskForm.actual_end_date} onChange={e => setTaskForm(f => ({ ...f, actual_end_date: e.target.value }))} style={inputStyle} /></label>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <button type="submit" style={btnPrimary}>Add</button>
              <button type="button" style={btnSecondary} onClick={closeTaskAdd}>Cancel</button>
            </div>
          </form>
        )}
        {tasks.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No tasks. Add tasks to see them on the <Link to="/gantt">Gantt chart</Link> (planning vs actual).</p>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Task</th>
                  <th style={thStyle}>Assignee</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Planned</th>
                  <th style={thStyle}>Actual</th>
                  <th style={thStyle}>Progress</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const isGroup = t.task_kind === 'group';
                  const isChild = t.parent_id != null;
                  return (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isGroup ? 'var(--surface-hover)' : undefined,
                      }}
                    >
                      <td style={{ ...tdStyle, paddingLeft: isChild ? '1.75rem' : tdStyle.padding }}>
                        {isGroup && (
                          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{t.name}</span>
                        )}
                        {!isGroup && isChild && (
                          <span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t.parent_name || 'Group'} / </span>
                            {t.name}
                          </span>
                        )}
                        {!isGroup && !isChild && <span>{t.name}</span>}
                      </td>
                      <td style={tdStyle}>
                        {isGroup ? (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        ) : (
                          <select
                            value={t.assignee_id != null ? String(t.assignee_id) : ''}
                            onChange={e => patchTask(t.id, { assignee_id: e.target.value === '' ? null : +e.target.value })}
                            aria-label={`Assignee for ${t.name}`}
                            style={{ ...inputStyle, marginTop: 0, padding: '0.35rem 0.5rem', maxWidth: '12rem' }}
                          >
                            <option value="">Unassigned</option>
                            {allPeople.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {isGroup ? (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        ) : (
                          <select
                            value={t.status || 'new'}
                            onChange={e => patchTask(t.id, { status: e.target.value })}
                            aria-label={`Status for ${t.name}`}
                            style={{ ...inputStyle, marginTop: 0, padding: '0.35rem 0.5rem', maxWidth: '9rem' }}
                          >
                            <option value="new">New</option>
                            <option value="ongoing">Ongoing</option>
                            <option value="done">Done</option>
                          </select>
                        )}
                      </td>
                      <td style={tdStyle}>{t.planned_start_date || '–'} – {t.planned_end_date || '–'}</td>
                      <td style={tdStyle}>
                        {isGroup ? (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        ) : (
                          <>{t.actual_start_date || '–'} – {t.actual_end_date || '–'}</>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {isGroup ? <span style={{ color: 'var(--text-muted)' }}>—</span> : <>{t.progress_percent ?? 0}%</>}
                      </td>
                      <td style={tdStyle}>
                        <button type="button" onClick={() => deleteTask(t.id, t.task_kind)} style={{ ...btnSecondary, padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = { display: 'block', width: '100%', padding: '0.5rem 0.75rem', marginTop: '0.25rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' };
const btnPrimary = { padding: '0.5rem 1rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600 };
const btnSecondary = { padding: '0.5rem 1rem', background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8 };
const thStyle = { padding: '0.6rem 0.5rem 0.6rem 0', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem' };
const tdStyle = { padding: '0.6rem 0.5rem 0.6rem 0' };
const tagChip = { display: 'inline-flex', alignItems: 'center', padding: '0.2rem 0.5rem', background: 'var(--surface-hover)', borderRadius: 6, fontSize: '0.8rem', color: 'var(--text-muted)' };
const tagChipButton = { display: 'inline-flex', alignItems: 'center', padding: '0.25rem 0.5rem', margin: '0 0.25rem 0.25rem 0', background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem', color: 'var(--accent)', cursor: 'pointer' };

export default ProjectDetail;
