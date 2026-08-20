import { useCallback, useState } from 'react';
import { api } from '../api';
import { useSubmitLock } from './useSubmitLock';
import { useOptimisticList } from './useOptimisticList';
import { nextSupportLevel, supportLevelLabel } from '../../lib/issueWorkflow.js';

const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'medium',
  category: 'support',
  incident_type: 'issue',
  module_code: 'CK',
  intake_channel: 'helpdesk',
  client_pic: '',
  project_id: '',
  client_id: '',
  assignee_person_id: '',
  external_ticket_ref: '',
  backlog_ref: '',
  issue_attachment_ref: '',
};

function enrichLocalPatch(partial, { people, projects, clients }) {
  const next = { ...partial };
  if (Object.prototype.hasOwnProperty.call(partial, 'assignee_person_id')) {
    const pid = partial.assignee_person_id;
    if (pid == null || pid === '') {
      next.assignee_person_id = null;
      next.assignee_name = null;
    } else {
      const person = people.find((p) => Number(p.id) === Number(pid));
      next.assignee_person_id = +pid;
      if (person) next.assignee_name = person.name;
    }
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'project_id')) {
    const pid = partial.project_id;
    if (pid == null || pid === '') {
      next.project_id = null;
      next.project_name = null;
    } else {
      const project = projects.find((p) => Number(p.id) === Number(pid));
      next.project_id = +pid;
      if (project) next.project_name = project.name;
    }
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'client_id')) {
    const cid = partial.client_id;
    if (cid == null || cid === '') {
      next.client_id = null;
      next.client_name = null;
    } else {
      const client = clients.find((c) => Number(c.id) === Number(cid));
      next.client_id = +cid;
      if (client) next.client_name = client.name;
    }
  }
  return next;
}

function reconcileIssue(prev, result) {
  if (!result || result.id == null) return prev;
  const nid = Number(result.id);
  return prev.map((row) => (Number(row.id) === nid ? { ...row, ...result } : row));
}

/**
 * Helpdesk create / patch / escalate / resolve / promote / import mutations.
 * patch / escalate / resolve use optimistic UI with rollback on failure.
 */
export function useHelpdeskMutations({
  setIssues,
  people,
  projects,
  clients,
  load,
  closeIssue,
}) {
  const { pending: saving, run } = useSubmitLock();
  const { runOptimistic } = useOptimisticList(setIssues);

  const [importing, setImporting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [promoteIssue, setPromoteIssue] = useState(null);
  const [promoteProjectId, setPromoteProjectId] = useState('');
  const [promoteAssignee, setPromoteAssignee] = useState('');

  const [escalateIssue, setEscalateIssue] = useState(null);
  const [escalateAssignee, setEscalateAssignee] = useState('');
  const [escalateNote, setEscalateNote] = useState('');

  const [resolveIssue, setResolveIssue] = useState(null);
  const [resolveMethod, setResolveMethod] = useState('whatsapp');
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolveAction, setResolveAction] = useState('');

  const patchIssue = useCallback(async (id, partial) => {
    const local = enrichLocalPatch(partial, { people, projects, clients });
    await runOptimistic({
      apply: (prev) => prev.map((row) => (
        Number(row.id) === Number(id) ? { ...row, ...local } : row
      )),
      request: () => api.issues.update(id, partial),
      reconcile: (prev, result) => reconcileIssue(prev, result),
      onError: (err) => alert(err.message),
    });
  }, [runOptimistic, people, projects, clients]);

  const openEscalate = useCallback((issue) => {
    setEscalateIssue(issue);
    setEscalateAssignee('');
    setEscalateNote('');
  }, []);

  const confirmEscalate = useCallback(async (e) => {
    e.preventDefault();
    if (!escalateIssue || !escalateAssignee) return;
    const issueId = escalateIssue.id;
    const nextLevel = nextSupportLevel(escalateIssue.support_level);
    if (!nextLevel) return;
    const assigneeId = +escalateAssignee;
    const person = people.find((p) => Number(p.id) === assigneeId);
    const note = escalateNote;
    const snapshotIssue = escalateIssue;

    setEscalateIssue(null);
    closeIssue?.();

    await run(async () => {
      await runOptimistic({
        apply: (prev) => prev.map((row) => {
          if (Number(row.id) !== Number(issueId)) return row;
          const patch = {
            support_level: nextLevel,
            helpdesk_stage: nextLevel,
            helpdesk_stage_label: supportLevelLabel(nextLevel),
            assignee_person_id: assigneeId,
            assignee_name: person?.name || row.assignee_name,
            status: 'open',
            resolution_method: null,
            resolution_notes: null,
          };
          if (nextLevel === 'L2' && person?.name) {
            patch.l2_assignee_label = `CTSB | ${person.name}`;
          }
          return { ...row, ...patch };
        }),
        request: () => api.issues.escalate(issueId, {
          assignee_person_id: assigneeId,
          note: note || undefined,
        }),
        reconcile: (prev, result) => reconcileIssue(prev, result),
        onError: (err) => {
          alert(err.message);
          setEscalateIssue(snapshotIssue);
          setEscalateAssignee(String(assigneeId));
          setEscalateNote(note);
        },
      });
    });
  }, [escalateIssue, escalateAssignee, escalateNote, people, run, runOptimistic, closeIssue]);

  const openResolve = useCallback((issue) => {
    setResolveIssue(issue);
    setResolveMethod(issue.intake_channel === 'call' ? 'call' : (issue.intake_channel || 'whatsapp'));
    setResolveNotes('');
    setResolveAction(issue.action_taken || '');
  }, []);

  const confirmResolve = useCallback(async (e) => {
    e.preventDefault();
    if (!resolveIssue || !resolveMethod) return;
    const issueId = resolveIssue.id;
    const method = resolveMethod;
    const notes = resolveNotes;
    const action = resolveAction;
    const snapshotIssue = resolveIssue;

    setResolveIssue(null);
    closeIssue?.();

    await run(async () => {
      await runOptimistic({
        apply: (prev) => prev.map((row) => {
          if (Number(row.id) !== Number(issueId)) return row;
          return {
            ...row,
            status: 'resolved',
            resolution_method: method,
            resolution_notes: notes || null,
            action_taken: action || row.action_taken || notes || null,
          };
        }),
        request: () => api.issues.resolve(issueId, {
          resolution_method: method,
          resolution_notes: notes || undefined,
          action_taken: action || undefined,
        }),
        reconcile: (prev, result) => reconcileIssue(prev, result),
        onError: (err) => {
          alert(err.message);
          setResolveIssue(snapshotIssue);
          setResolveMethod(method);
          setResolveNotes(notes);
          setResolveAction(action);
        },
      });
    });
  }, [resolveIssue, resolveMethod, resolveNotes, resolveAction, run, runOptimistic, closeIssue]);

  const promoteToBacklog = useCallback((issue) => {
    if (!issue.can_promote_backlog) {
      alert('This issue cannot be promoted (closed or already in backlog).');
      return;
    }
    setPromoteIssue(issue);
    setPromoteProjectId(
      issue.project_id ? String(issue.project_id) : (projects[0]?.id ? String(projects[0].id) : ''),
    );
    setPromoteAssignee(issue.assignee_person_id ? String(issue.assignee_person_id) : '');
  }, [projects]);

  const confirmPromote = useCallback(async (e) => {
    e.preventDefault();
    if (!promoteIssue || !promoteProjectId || !promoteAssignee) return;
    await run(async () => {
      try {
        const res = await api.issues.promoteToBacklog(promoteIssue.id, {
          project_id: +promoteProjectId,
          assignee_person_id: +promoteAssignee,
        });
        setPromoteIssue(null);
        closeIssue?.();
        const msg = res.created === false
          ? `Linked to existing backlog: ${res.backlog?.ref_no}`
          : `Backlog created: ${res.backlog?.ref_no}`;
        alert(msg);
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  }, [promoteIssue, promoteProjectId, promoteAssignee, run, closeIssue, load]);

  const submitCreate = useCallback(async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    await run(async () => {
      try {
        await api.issues.create({
          ...form,
          project_id: form.project_id || null,
          client_id: form.client_id || null,
          assignee_person_id: form.assignee_person_id || null,
          external_ticket_ref: form.external_ticket_ref || null,
        });
        setShowForm(false);
        setForm(EMPTY_FORM);
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  }, [form, run, load]);

  const runImportEticket = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setImporting(true);
      try {
        const csv = await file.text();
        const res = await api.issues.importEticket(csv);
        alert(`Import selesai: ${res.imported} rekod, ${res.skipped} dilangkau.`);
        load();
      } catch (err) {
        alert(err.message);
      } finally {
        setImporting(false);
      }
    };
    input.click();
  }, [load]);

  return {
    saving,
    importing,
    showForm,
    setShowForm,
    form,
    setForm,
    submitCreate,
    promoteIssue,
    setPromoteIssue,
    promoteProjectId,
    setPromoteProjectId,
    promoteAssignee,
    setPromoteAssignee,
    promoteToBacklog,
    confirmPromote,
    escalateIssue,
    setEscalateIssue,
    escalateAssignee,
    setEscalateAssignee,
    escalateNote,
    setEscalateNote,
    openEscalate,
    confirmEscalate,
    resolveIssue,
    setResolveIssue,
    resolveMethod,
    setResolveMethod,
    resolveNotes,
    setResolveNotes,
    resolveAction,
    setResolveAction,
    openResolve,
    confirmResolve,
    patchIssue,
    runImportEticket,
  };
}
