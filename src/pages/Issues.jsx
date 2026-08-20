import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { canAssignIssues, personIdForUser } from '../../lib/permissions.js';
import PageHeader from '../components/PageHeader';
import PageLoadError from '../components/PageLoadError';
import PageLoadingState from '../components/PageLoadingState';
import { levelClass } from '../utils/issueUi';
import { OPEN_ISSUE_STATUSES } from '../../lib/issueWorkflow.js';
import { useHelpdeskData } from '../hooks/useHelpdeskData';
import { useHelpdeskMutations } from '../hooks/useHelpdeskMutations';
import {
  HelpdeskToolbar,
  HelpdeskKpis,
  HelpdeskIssueTable,
  HelpdeskIssueDetail,
  HelpdeskEscalateModal,
  HelpdeskResolveModal,
  HelpdeskPromoteModal,
  HelpdeskCreateForm,
} from '../components/helpdesk';

export default function Issues() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const mayAssign = canAssignIssues(user);

  const [filter, setFilter] = useState('open');
  const [levelFilter, setLevelFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [incidentFilter, setIncidentFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mineOnly, setMineOnly] = useState(false);

  const {
    issues,
    setIssues,
    projects,
    clients,
    people,
    backlogs,
    loading,
    loadError,
    load,
  } = useHelpdeskData(mineOnly);

  const selectedIssueId = searchParams.get('issue') ? +searchParams.get('issue') : null;

  const openIssue = useCallback((issue) => {
    const next = new URLSearchParams(searchParams);
    next.set('issue', String(issue.id));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const closeIssue = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('issue');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const m = useHelpdeskMutations({
    setIssues,
    people,
    projects,
    clients,
    load,
    closeIssue,
  });

  const myPersonId = useMemo(() => personIdForUser(user, people), [user, people]);

  const isAssignee = useCallback(
    (issue) => myPersonId != null && issue.assignee_person_id === myPersonId,
    [myPersonId],
  );

  const canEscalate = useCallback((issue) => {
    if ((issue.helpdesk_stage || issue.support_level || 'L1') !== 'L1') return false;
    if (!OPEN_ISSUE_STATUSES.has(issue.status)) return false;
    return mayAssign || isAssignee(issue);
  }, [mayAssign, isAssignee]);

  const canResolve = useCallback((issue) => {
    if (!OPEN_ISSUE_STATUSES.has(issue.status)) return false;
    return mayAssign || isAssignee(issue);
  }, [mayAssign, isAssignee]);

  const selectedIssue = useMemo(
    () => issues.find((i) => i.id === selectedIssueId) || null,
    [issues, selectedIssueId],
  );

  const stats = useMemo(() => {
    const open = issues.filter((i) => OPEN_ISSUE_STATUSES.has(i.status));
    return {
      open: open.length,
      critical: open.filter((i) => i.priority === 'critical').length,
      waiting: issues.filter((i) => i.status === 'waiting_agency').length,
      resolved: issues.filter((i) => i.status === 'resolved' || i.status === 'closed').length,
      l1: open.filter((i) => i.helpdesk_stage === 'L1').length,
      l2: open.filter((i) => i.helpdesk_stage === 'L2').length,
      backlog: open.filter((i) => i.helpdesk_stage === 'backlog').length,
    };
  }, [issues]);

  const visible = useMemo(() => {
    let list = issues;
    if (filter === 'open') list = list.filter((i) => OPEN_ISSUE_STATUSES.has(i.status));
    else if (filter !== 'all') list = list.filter((i) => i.status === filter);
    if (levelFilter !== 'all') list = list.filter((i) => i.helpdesk_stage === levelFilter);
    if (moduleFilter !== 'all') list = list.filter((i) => (i.module_code || 'XXX') === moduleFilter);
    if (incidentFilter !== 'all') list = list.filter((i) => i.incident_type === incidentFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((i) => (
        String(i.ticket_no || '').toLowerCase().includes(q)
        || String(i.title || '').toLowerCase().includes(q)
        || String(i.external_ticket_ref || '').toLowerCase().includes(q)
        || String(i.backlog_ref || '').toLowerCase().includes(q)
        || String(i.client_name || '').toLowerCase().includes(q)
      ));
    }
    return list;
  }, [issues, filter, levelFilter, moduleFilter, incidentFilter, searchQuery]);

  const hasExtraFilters = levelFilter !== 'all'
    || moduleFilter !== 'all'
    || incidentFilter !== 'all'
    || filter !== 'open'
    || searchQuery.trim() !== '';

  const resetFilters = () => {
    setFilter('open');
    setLevelFilter('all');
    setModuleFilter('all');
    setIncidentFilter('all');
    setSearchQuery('');
  };

  const backlogByIssue = useMemo(() => {
    const map = new Map();
    backlogs.forEach((b) => {
      if (b.issue_id) map.set(b.issue_id, b);
    });
    return map;
  }, [backlogs]);

  if (loading) return <PageLoadingState message="Loading helpdesk…" />;
  if (loadError) return <PageLoadError message={loadError} onRetry={load} />;

  return (
    <div className="page-module helpdesk-page">
      <PageHeader
        eyebrow="Service desk"
        title="Helpdesk"
        badge={stats.open > 0 ? `${stats.open} open` : null}
        subtitle="Track client tickets from external QA helpdesk. Resolve at L1 or L2, or promote to product backlog when dev/data work is needed."
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {mayAssign && (
              <button type="button" className="btn btn-secondary" onClick={m.runImportEticket} disabled={m.importing || m.saving}>
                {m.importing ? 'Importing…' : 'Import eTicket CSV'}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => m.setShowForm(true)}>
              + Log ticket
            </button>
          </div>
        }
      />

      <div className="helpdesk-workflow-banner card section-card" role="note">
        <p>
          <strong>Support flow:</strong>{' '}
          <span className={levelClass('L1')}>1st level</span>
          {' → '}
          <span className={levelClass('L2')}>2nd level</span>
          {' → '}
          <span className={levelClass('backlog')}>Backlog</span>
          . Resolve at L1/L2, or use <strong>→ Backlog</strong> when dev/data work is needed.
        </p>
      </div>

      <HelpdeskKpis stats={stats} />

      <HelpdeskToolbar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        filter={filter}
        onFilterChange={setFilter}
        levelFilter={levelFilter}
        onLevelFilterChange={setLevelFilter}
        moduleFilter={moduleFilter}
        onModuleFilterChange={setModuleFilter}
        incidentFilter={incidentFilter}
        onIncidentFilterChange={setIncidentFilter}
        mineOnly={mineOnly}
        onMineOnlyChange={setMineOnly}
        hasExtraFilters={hasExtraFilters}
        onResetFilters={resetFilters}
        visibleCount={visible.length}
        totalCount={issues.length}
      />

      <HelpdeskIssueTable
        visible={visible}
        issuesLength={issues.length}
        selectedIssueId={selectedIssueId}
        people={people}
        mayAssign={mayAssign}
        backlogByIssue={backlogByIssue}
        saving={m.saving}
        onOpenIssue={openIssue}
        onPatchIssue={m.patchIssue}
        onOpenResolve={m.openResolve}
        onOpenEscalate={m.openEscalate}
        onPromoteToBacklog={m.promoteToBacklog}
        onShowForm={() => m.setShowForm(true)}
        canResolve={canResolve}
        canEscalate={canEscalate}
      />

      {selectedIssue && (
        <HelpdeskIssueDetail
          issue={selectedIssue}
          projects={projects}
          clients={clients}
          mayAssign={mayAssign}
          backlogByIssue={backlogByIssue}
          saving={m.saving}
          onClose={closeIssue}
          onPatchIssue={m.patchIssue}
          onOpenResolve={m.openResolve}
          onOpenEscalate={m.openEscalate}
          onPromoteToBacklog={m.promoteToBacklog}
          canResolve={canResolve}
          canEscalate={canEscalate}
        />
      )}

      {m.escalateIssue && (
        <HelpdeskEscalateModal
          issue={m.escalateIssue}
          people={people}
          assignee={m.escalateAssignee}
          onAssigneeChange={m.setEscalateAssignee}
          note={m.escalateNote}
          onNoteChange={m.setEscalateNote}
          saving={m.saving}
          onCancel={() => m.setEscalateIssue(null)}
          onSubmit={m.confirmEscalate}
        />
      )}

      {m.resolveIssue && (
        <HelpdeskResolveModal
          issue={m.resolveIssue}
          method={m.resolveMethod}
          onMethodChange={m.setResolveMethod}
          notes={m.resolveNotes}
          onNotesChange={m.setResolveNotes}
          action={m.resolveAction}
          onActionChange={m.setResolveAction}
          saving={m.saving}
          onCancel={() => m.setResolveIssue(null)}
          onSubmit={m.confirmResolve}
        />
      )}

      {m.promoteIssue && (
        <HelpdeskPromoteModal
          issue={m.promoteIssue}
          projects={projects}
          people={people}
          projectId={m.promoteProjectId}
          onProjectIdChange={m.setPromoteProjectId}
          assignee={m.promoteAssignee}
          onAssigneeChange={m.setPromoteAssignee}
          saving={m.saving}
          onCancel={() => m.setPromoteIssue(null)}
          onSubmit={m.confirmPromote}
        />
      )}

      {m.showForm && (
        <HelpdeskCreateForm
          form={m.form}
          onFormChange={m.setForm}
          projects={projects}
          clients={clients}
          people={people}
          mayAssign={mayAssign}
          saving={m.saving}
          onCancel={() => m.setShowForm(false)}
          onSubmit={m.submitCreate}
        />
      )}
    </div>
  );
}
