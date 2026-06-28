import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { canViewFinance } from '../../lib/permissions.js';
import PageHeader from '../components/PageHeader';
import UiEmptyState from '../components/UiEmptyState';
import ModuleFilterBar from '../components/ModuleFilterBar';
import PageLoadingState from '../components/PageLoadingState';
import ChartCard from '../components/charts/ChartCard';
import DonutChart from '../components/charts/DonutChart';
import { engagementTypeLabel, deliveryScopeLabel } from '../../lib/projectConstants.js';
import { paymentStatusLabel } from '../../lib/phaseConstants.js';
import { renewalStatusLabel } from '../../lib/financeRenewals.js';

const VIEW_FILTERS = [
  { id: 'all', label: 'Full overview' },
  { id: 'queue', label: 'Action queue' },
  { id: 'claimed', label: 'Paid & claimed' },
  { id: 'renewals', label: 'Maintenance renewals' },
  { id: 'portfolio', label: 'Portfolio only' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function PhaseFinanceActions({ phase, onUpdated, canAct }) {
  const [busy, setBusy] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState(phase.invoice_no || '');

  if (!canAct) return null;

  const submitInvoiced = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.projectPhases.update(phase.id, {
        payment_status: 'invoiced',
        invoice_no: invoiceNo.trim() || null,
        invoice_date: phase.invoice_date || todayIso(),
      });
      setShowInvoice(false);
      onUpdated();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async () => {
    if (!window.confirm(`Mark "${phase.name}" as paid?`)) return;
    setBusy(true);
    try {
      await api.projectPhases.update(phase.id, {
        payment_status: 'paid',
        paid_date: phase.paid_date || todayIso(),
      });
      onUpdated();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (phase.payment_status === 'pending' && phase.status === 'completed') {
    return (
      <>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowInvoice(true)} disabled={busy}>
          Mark invoiced
        </button>
        {showInvoice && (
          <div className="modal-backdrop finance-invoice-modal" role="presentation" onClick={(e) => e.target === e.currentTarget && setShowInvoice(false)}>
            <form className="modal-dialog finance-invoice-form" onSubmit={submitInvoiced} onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-dialog-title" style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Mark as invoiced</h3>
              <p className="pmo-table-muted" style={{ margin: '0 0 0.75rem' }}>{phase.project_name} · {phase.name}</p>
              <label className="form-field">
                <span className="form-field__label">Invoice number</span>
                <input className="form-field__input ui-input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Optional" autoFocus />
              </label>
              <div className="finance-invoice-form__actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowInvoice(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? '…' : 'Confirm'}</button>
              </div>
            </form>
          </div>
        )}
      </>
    );
  }
  if (phase.payment_status === 'invoiced') {
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={markPaid} disabled={busy}>
        {busy ? '…' : 'Mark paid'}
      </button>
    );
  }
  return null;
}

function formatMoney(amount, currency = 'MYR') {
  if (amount == null) return '—';
  const n = +amount;
  if (!Number.isFinite(n)) return '—';
  return `${currency} ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMoneyCompact(amount, currency = 'MYR') {
  if (amount == null) return '—';
  const n = +amount;
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${currency} ${(n / 1_000).toFixed(1)}k`;
  return formatMoney(n, currency);
}

function downloadCsv(filename, rows) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function PaymentBadge({ status }) {
  const tone =
    status === 'paid' ? 'paid'
      : status === 'invoiced' ? 'invoiced'
        : status === 'pending' ? 'pending'
          : 'muted';
  return (
    <span className={`delivery-payment-badge delivery-payment-badge--${tone}`}>
      {paymentStatusLabel(status)}
    </span>
  );
}

function PaymentProgress({ paid, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  return (
    <div className="finance-payment-progress" title={`${pct}% collected`}>
      <div className="pmo-progress-bar" aria-hidden>
        <div
          className="pmo-progress-fill"
          style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--success)' : 'var(--accent)' }}
        />
      </div>
      <span className="finance-payment-progress__label">{pct}%</span>
    </div>
  );
}

export default function Finance() {
  const { user } = useAuth();
  const canAct = canViewFinance(user);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('all');
  const [search, setSearch] = useState('');

  const loadSummary = useCallback(() => {
    setLoading(true);
    api.projectPhases.financeSummary()
      .then(setSummary)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const totals = useMemo(() => {
    const projects = summary?.projects || [];
    const totalContract = projects.reduce((s, p) => s + (+p.total_contract || 0), 0);
    const totalPaid = projects.reduce((s, p) => s + (+p.total_paid || 0), 0);
    const totalInvoiced = projects.reduce((s, p) => s + (+p.total_invoiced || 0), 0);
    const readyAmount = (summary?.ready_to_bill || []).reduce((s, p) => s + (+p.payment_amount || 0), 0);
    const collectionRate = totalContract > 0 ? Math.round((totalPaid / totalContract) * 100) : 0;
    const outstanding = totalInvoiced + readyAmount;
    return {
      totalContract,
      totalPaid,
      totalInvoiced,
      readyAmount,
      collectionRate,
      outstanding,
      projectCount: projects.length,
      readyCount: summary?.ready_to_bill?.length || 0,
      invoicedCount: summary?.invoiced?.length || 0,
      paidCount: summary?.paid?.length || 0,
    };
  }, [summary]);

  const paymentMix = useMemo(() => [
    { key: 'paid', label: 'Paid', value: totals.totalPaid, color: 'var(--success)' },
    { key: 'invoiced', label: 'Invoiced (unpaid)', value: totals.totalInvoiced, color: 'var(--warning)' },
    { key: 'ready', label: 'Ready to bill', value: totals.readyAmount, color: 'var(--accent)' },
  ], [totals]);

  const q = search.trim().toLowerCase();
  const matchesSearch = (name) => !q || (name || '').toLowerCase().includes(q);

  const readyToBill = useMemo(
    () => (summary?.ready_to_bill || []).filter((p) => matchesSearch(p.project_name)),
    [summary, q],
  );
  const invoiced = useMemo(
    () => (summary?.invoiced || []).filter((p) => matchesSearch(p.project_name)),
    [summary, q],
  );
  const paidMilestones = useMemo(
    () => (summary?.paid || []).filter((p) => matchesSearch(p.project_name)),
    [summary, q],
  );
  const maintenanceRenewals = useMemo(
    () => (summary?.maintenance_renewals || []).filter((p) => matchesSearch(p.project_name) || matchesSearch(p.client_name)),
    [summary, q],
  );

  const projects = useMemo(
    () => (summary?.projects || []).filter((p) => matchesSearch(p.project_name)),
    [summary, q],
  );

  const renewalCount = summary?.maintenance_renewals?.length || 0;

  const hasAnyData = (summary?.projects?.length || 0) > 0
    || (summary?.ready_to_bill?.length || 0) > 0
    || (summary?.invoiced?.length || 0) > 0;

  const showQueue = view === 'all' || view === 'queue';
  const showClaimed = view === 'all' || view === 'claimed';
  const showRenewals = view === 'all' || view === 'renewals';
  const showPortfolio = view === 'all' || view === 'portfolio';
  const actionCount = totals.readyCount + totals.invoicedCount + renewalCount;

  const exportReadyToBill = () => {
    if (!summary?.ready_to_bill?.length) return;
    const header = ['Project', 'Phase', 'Amount', 'Currency', 'Completed', 'Target date'];
    const rows = summary.ready_to_bill.map((p) => [
      p.project_name,
      p.name,
      p.payment_amount,
      p.payment_currency || 'MYR',
      p.completed_date || '',
      p.target_date || '',
    ]);
    downloadCsv(`pmo-ready-to-bill-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  const workPackagesFinance = useMemo(
    () => (summary?.work_packages || []).filter((wp) => matchesSearch(wp.project_name) || matchesSearch(wp.work_package_name)),
    [summary, q],
  );

  const exportPortfolio = () => {
    if (!summary?.projects?.length) return;
    const header = ['Project', 'Client', 'Current phase', 'Engagement', 'Contract value', 'Paid', 'Invoiced (unpaid)', 'Collection %'];
    const rows = summary.projects.map((p) => {
      const pct = p.total_contract > 0 ? Math.round((p.total_paid / p.total_contract) * 100) : 0;
      return [
        p.project_name,
        p.client_name || '',
        p.current_phase,
        engagementTypeLabel(p.engagement_type) || deliveryScopeLabel(p.classification) || '',
        p.total_contract,
        p.total_paid,
        p.total_invoiced,
        pct,
      ];
    });
    downloadCsv(`pmo-finance-portfolio-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  if (loading) return <PageLoadingState message="Loading finance view…" />;

  return (
    <div className="page-module finance-page">
      <PageHeader
        eyebrow="Finance"
        title="Delivery & payment"
        badge={actionCount > 0 ? `${actionCount} need action` : null}
        subtitle="Track milestone billing by phase — mark invoiced/paid, see what is already claimed, and follow up on maintenance renewals."
        actions={
          <div className="finance-header-actions">
            {summary?.ready_to_bill?.length > 0 && (
              <button type="button" className="btn btn-primary" onClick={exportReadyToBill}>
                Export ready-to-bill
              </button>
            )}
            {summary?.projects?.length > 0 && (
              <button type="button" className="btn btn-secondary" onClick={exportPortfolio}>
                Export portfolio
              </button>
            )}
          </div>
        }
      />

      <section className="dashboard-stats kpi-strip finance-kpis" aria-label="Finance summary">
        <div className="dashboard-stat-card finance-stat-card">
          <span className="dashboard-stat-label">Portfolio value</span>
          <span className="dashboard-stat-value finance-stat-value--money">
            {formatMoneyCompact(totals.totalContract)}
          </span>
          <span className="dashboard-stat-hint">{totals.projectCount} project{totals.projectCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="dashboard-stat-card finance-stat-card">
          <span className="dashboard-stat-label">Collected</span>
          <span className="dashboard-stat-value pmo-stat-success finance-stat-value--money">
            {formatMoneyCompact(totals.totalPaid)}
          </span>
          <span className="dashboard-stat-hint">{totals.collectionRate}% of contract value</span>
        </div>
        <div className={`dashboard-stat-card finance-stat-card ${totals.readyCount ? 'has-issue' : ''}`}>
          <span className="dashboard-stat-label">Ready to bill</span>
          <span className="dashboard-stat-value pmo-stat-warning">{totals.readyCount}</span>
          <span className="dashboard-stat-hint">{formatMoneyCompact(totals.readyAmount)}</span>
        </div>
        <div className={`dashboard-stat-card finance-stat-card ${totals.invoicedCount ? 'has-issue' : ''}`}>
          <span className="dashboard-stat-label">Awaiting payment</span>
          <span className="dashboard-stat-value pmo-stat-warning">{totals.invoicedCount}</span>
          <span className="dashboard-stat-hint">{formatMoneyCompact(totals.totalInvoiced)}</span>
        </div>
        <div className="dashboard-stat-card finance-stat-card">
          <span className="dashboard-stat-label">Paid milestones</span>
          <span className="dashboard-stat-value pmo-stat-success">{totals.paidCount}</span>
          <span className="dashboard-stat-hint">Completed & settled</span>
        </div>
        <div className="dashboard-stat-card finance-stat-card">
          <span className="dashboard-stat-label">Outstanding pipeline</span>
          <span className="dashboard-stat-value finance-stat-value--money">
            {formatMoneyCompact(totals.outstanding)}
          </span>
          <span className="dashboard-stat-hint">Ready + invoiced unpaid</span>
        </div>
      </section>

      {hasAnyData && (
        <div className="finance-overview">
          <ChartCard title="Payment pipeline" subtitle="Contract value by billing status">
            <DonutChart
              data={paymentMix}
              centerValue={`${totals.collectionRate}%`}
              centerLabel="collected"
            />
            <ul className="finance-mix-legend">
              {paymentMix.map((item) => (
                <li key={item.key}>
                  <span className="finance-mix-legend__swatch" style={{ background: item.color }} aria-hidden />
                  <span className="finance-mix-legend__label">{item.label}</span>
                  <span className="finance-mix-legend__value">{formatMoneyCompact(item.value)}</span>
                </li>
              ))}
            </ul>
          </ChartCard>

          <div className="finance-insight-stack">
            <article className="finance-insight-card finance-insight-card--accent">
              <span className="finance-insight-card__label">Collection rate</span>
              <span className="finance-insight-card__value">{totals.collectionRate}%</span>
              <p className="finance-insight-card__desc">
                {formatMoney(totals.totalPaid)} received of {formatMoney(totals.totalContract)} total milestones.
              </p>
            </article>
            <article className={`finance-insight-card ${actionCount ? 'finance-insight-card--warn' : ''}`}>
              <span className="finance-insight-card__label">Billing actions</span>
              <span className="finance-insight-card__value">{actionCount}</span>
              <p className="finance-insight-card__desc">
                {totals.readyCount} phase{totals.readyCount !== 1 ? 's' : ''} ready to invoice
                {totals.invoicedCount > 0 && ` · ${totals.invoicedCount} invoice${totals.invoicedCount !== 1 ? 's' : ''} awaiting payment`}
              </p>
            </article>
            <article className="finance-insight-card">
              <span className="finance-insight-card__label">Quick links</span>
              <div className="finance-quick-links">
                <Link to="/reports" className="finance-quick-link">Reports & exports</Link>
                <Link to="/projects" className="finance-quick-link">Project workspaces</Link>
              </div>
            </article>
          </div>
        </div>
      )}

      {hasAnyData && (
        <ModuleFilterBar
          summary={search ? `Filtered by "${search.trim()}"` : `View: ${VIEW_FILTERS.find((f) => f.id === view)?.label || view}`}
        >
          <label className="module-toolbar__field module-toolbar__field--grow">
            <span className="module-toolbar__label">Search</span>
            <input
              type="search"
              className="form-field__input pmo-filter-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Project name…"
              aria-label="Search finance by project"
            />
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">View</span>
            <select
              className="form-field__input pmo-filter-input"
              value={view}
              onChange={(e) => setView(e.target.value)}
              aria-label="Finance view filter"
            >
              {VIEW_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
          {search && (
            <button type="button" className="btn btn-ghost btn-sm helpdesk-filter-reset" onClick={() => setSearch('')}>
              Reset
            </button>
          )}
        </ModuleFilterBar>
      )}

      {!hasAnyData ? (
        <div className="card section-card">
          <UiEmptyState
            title="No payment milestones yet"
            description="PMO can initialize delivery phases in each project workspace. Payment amounts and statuses will appear here for finance review."
            action={<Link to="/projects" className="btn btn-primary btn-sm">Go to projects</Link>}
          />
        </div>
      ) : (
        <>
          {showQueue && readyToBill.length > 0 && (
            <section className="card section-card finance-queue-card">
              <div className="section-card__header finance-section-header finance-section-header--warn">
                <div>
                  <h2 className="section-card__title">Ready to bill</h2>
                  <p className="section-card__desc">
                    Completed phases with pending payment — create invoices from these milestones.
                  </p>
                </div>
                <span className="finance-section-badge">{readyToBill.length}</span>
              </div>
              <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
                <table className="pmo-data-list pmo-portfolio-table finance-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Phase</th>
                      <th className="hide-mobile">Work package</th>
                      <th className="finance-col-money">Amount</th>
                      <th>Completed</th>
                      <th className="hide-mobile">Target</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readyToBill.map((p) => (
                      <tr key={p.id} className="finance-row--priority">
                        <td>
                          <Link to={`/projects/${p.project_id}`} className="pmo-link-strong">{p.project_name}</Link>
                        </td>
                        <td>{p.name}</td>
                        <td className="hide-mobile pmo-table-muted">{p.work_package_name || '—'}</td>
                        <td className="finance-col-money finance-money-cell">{formatMoney(p.payment_amount, p.payment_currency)}</td>
                        <td>{p.completed_date || '—'}</td>
                        <td className="hide-mobile">{p.target_date || '—'}</td>
                        <td><PaymentBadge status="pending" /></td>
                        <td>
                          <PhaseFinanceActions phase={p} onUpdated={loadSummary} canAct={canAct} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {showQueue && invoiced.length > 0 && (
            <section className="card section-card finance-queue-card">
              <div className="section-card__header finance-section-header">
                <div>
                  <h2 className="section-card__title">Invoiced — awaiting payment</h2>
                  <p className="section-card__desc">Milestones billed but not yet marked as paid.</p>
                </div>
                <span className="finance-section-badge finance-section-badge--muted">{invoiced.length}</span>
              </div>
              <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
                <table className="pmo-data-list pmo-portfolio-table finance-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Phase</th>
                      <th>Invoice no.</th>
                      <th className="finance-col-money">Amount</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiced.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link to={`/projects/${p.project_id}`} className="pmo-link-strong">{p.project_name}</Link>
                        </td>
                        <td>{p.name}</td>
                        <td className="finance-invoice-cell">{p.invoice_no || '—'}</td>
                        <td className="finance-col-money finance-money-cell">{formatMoney(p.payment_amount, p.payment_currency)}</td>
                        <td><PaymentBadge status={p.payment_status} /></td>
                        <td>
                          <PhaseFinanceActions phase={p} onUpdated={loadSummary} canAct={canAct} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {showQueue && view === 'queue' && !readyToBill.length && !invoiced.length && !maintenanceRenewals.length && (
            <div className="card section-card">
              <UiEmptyState
                title={search ? 'No matching billing actions' : 'No billing actions pending'}
                description={search ? 'Try clearing the search filter.' : 'All milestones are either not yet billable or already settled.'}
                action={search ? (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSearch('')}>Clear search</button>
                ) : null}
              />
            </div>
          )}

          {showRenewals && maintenanceRenewals.length > 0 && (
            <section className="card section-card finance-queue-card">
              <div className="section-card__header finance-section-header finance-section-header--warn">
                <div>
                  <h2 className="section-card__title">Maintenance renewal follow-up</h2>
                  <p className="section-card__desc">
                    Maintenance contracts that have expired or end within 90 days — contact the client about renewal.
                  </p>
                </div>
                <span className="finance-section-badge">{maintenanceRenewals.length}</span>
              </div>
              <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
                <table className="pmo-data-list pmo-portfolio-table finance-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th className="hide-mobile">Client</th>
                      <th>Contract end</th>
                      <th>Status</th>
                      <th className="hide-mobile">Maintenance phase</th>
                      <th className="hide-mobile">Last claimed</th>
                      <th className="finance-col-money">Total paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenanceRenewals.map((row) => (
                      <tr key={row.project_id} className={row.renewal_status === 'expired' ? 'finance-row--priority' : ''}>
                        <td>
                          <Link to={`/projects/${row.project_id}`} className="pmo-link-strong">{row.project_name}</Link>
                        </td>
                        <td className="hide-mobile pmo-table-muted">{row.client_name || '—'}</td>
                        <td>{row.end_date || '—'}</td>
                        <td>
                          <span className={`delivery-payment-badge delivery-payment-badge--${row.renewal_status === 'expired' ? 'pending' : 'invoiced'}`}>
                            {renewalStatusLabel(row.renewal_status)}
                          </span>
                        </td>
                        <td className="hide-mobile pmo-table-muted">
                          {row.maintenance_phase || '—'}
                          {row.maintenance_payment_status && (
                            <> · <PaymentBadge status={row.maintenance_payment_status} /></>
                          )}
                        </td>
                        <td className="hide-mobile pmo-table-muted">
                          {row.last_paid_phase ? `${row.last_paid_phase} (${row.last_paid_date || '—'})` : '—'}
                        </td>
                        <td className="finance-col-money finance-money-cell pmo-stat-success">
                          {formatMoney(row.total_paid)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {showRenewals && view === 'renewals' && !maintenanceRenewals.length && (
            <div className="card section-card">
              <UiEmptyState
                title={search ? 'No matching renewals' : 'No maintenance renewals due'}
                description={search ? 'Try clearing the search filter.' : 'No maintenance contracts are expired or ending within the next 90 days.'}
                action={search ? (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSearch('')}>Clear search</button>
                ) : null}
              />
            </div>
          )}

          {showClaimed && paidMilestones.length > 0 && (
            <section className="card section-card">
              <div className="section-card__header">
                <div>
                  <h2 className="section-card__title">Paid & claimed by phase</h2>
                  <p className="section-card__desc">
                    Milestones already invoiced and settled — confirms what has been claimed per project phase.
                  </p>
                </div>
                <span className="finance-section-badge finance-section-badge--muted">{paidMilestones.length}</span>
              </div>
              <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
                <table className="pmo-data-list pmo-portfolio-table finance-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Phase</th>
                      <th className="hide-mobile">Work package</th>
                      <th className="finance-col-money">Amount</th>
                      <th className="hide-mobile">Invoice</th>
                      <th>Paid date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paidMilestones.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link to={`/projects/${p.project_id}`} className="pmo-link-strong">{p.project_name}</Link>
                        </td>
                        <td>{p.name}</td>
                        <td className="hide-mobile pmo-table-muted">{p.work_package_name || '—'}</td>
                        <td className="finance-col-money finance-money-cell pmo-stat-success">
                          {formatMoney(p.payment_amount, p.payment_currency)}
                        </td>
                        <td className="hide-mobile finance-invoice-cell">{p.invoice_no || '—'}</td>
                        <td>{p.paid_date || '—'}</td>
                        <td><PaymentBadge status="paid" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {showClaimed && view === 'claimed' && !paidMilestones.length && (
            <div className="card section-card">
              <UiEmptyState
                title={search ? 'No matching paid milestones' : 'No paid milestones yet'}
                description="When Finance marks phases as paid, they appear here with invoice and paid date for audit."
              />
            </div>
          )}

          {showPortfolio && workPackagesFinance.length > 0 && (
            <section className="card section-card" style={{ marginBottom: '1rem' }}>
              <div className="section-card__header">
                <div>
                  <h2 className="section-card__title">By work package</h2>
                  <p className="section-card__desc">Delivery lines inside projects — each with its own delivery scope and milestones.</p>
                </div>
              </div>
              <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
                <table className="pmo-data-list pmo-portfolio-table finance-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Work package</th>
                      <th className="hide-mobile">Scope</th>
                      <th>Current phase</th>
                      <th className="finance-col-money">Contract</th>
                      <th className="finance-col-money">Paid</th>
                      <th>Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workPackagesFinance.map((wp) => (
                      <tr key={wp.work_package_id}>
                        <td>
                          <Link to={`/projects/${wp.project_id}`} className="pmo-link-strong">{wp.project_name}</Link>
                        </td>
                        <td>{wp.work_package_name}</td>
                        <td className="hide-mobile pmo-table-muted">{deliveryScopeLabel(wp.classification) || '—'}</td>
                        <td><span className="finance-phase-pill">{wp.current_phase}</span></td>
                        <td className="finance-col-money finance-money-cell">{formatMoney(wp.total_contract)}</td>
                        <td className="finance-col-money finance-money-cell pmo-stat-success">{formatMoney(wp.total_paid)}</td>
                        <td>
                          <PaymentProgress paid={wp.total_paid} total={wp.total_contract} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {showPortfolio && (
            <section className="card section-card">
              <div className="section-card__header">
                <div>
                  <h2 className="section-card__title">Portfolio by phase & payment</h2>
                  <p className="section-card__desc">Contract value, collection progress, and current delivery phase per project.</p>
                </div>
              </div>
              {!projects.length ? (
                <UiEmptyState
                  title="No projects match your search"
                  action={search ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSearch('')}>Clear search</button>
                  ) : null}
                />
              ) : (
                <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
                  <table className="pmo-data-list pmo-portfolio-table finance-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th className="hide-mobile">Client</th>
                        <th>Current phase</th>
                        <th className="hide-mobile">Engagement</th>
                        <th className="finance-col-money">Contract</th>
                        <th className="finance-col-money">Paid</th>
                        <th className="finance-col-money">Invoiced</th>
                        <th>Collected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((p) => (
                        <tr key={p.project_id}>
                          <td>
                            <Link to={`/projects/${p.project_id}`} className="pmo-link-strong">{p.project_name}</Link>
                          </td>
                          <td className="hide-mobile pmo-table-muted">{p.client_name || '—'}</td>
                          <td>
                            <span className="finance-phase-pill">{p.current_phase}</span>
                          </td>
                          <td className="hide-mobile pmo-table-muted">
                            {engagementTypeLabel(p.engagement_type) || deliveryScopeLabel(p.classification) || '—'}
                          </td>
                          <td className="finance-col-money finance-money-cell">{formatMoney(p.total_contract)}</td>
                          <td className="finance-col-money finance-money-cell pmo-stat-success">{formatMoney(p.total_paid)}</td>
                          <td className="finance-col-money finance-money-cell">{formatMoney(p.total_invoiced)}</td>
                          <td>
                            <PaymentProgress paid={p.total_paid} total={p.total_contract} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
