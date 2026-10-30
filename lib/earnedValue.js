/**
 * Lightweight earned value from task hours (PV = estimate, EV = estimate * progress, AC = actual).
 */
export function earnedValueFromTasks(tasks = []) {
  const leaves = (tasks || []).filter((t) => t.task_kind !== 'group');
  let pv = 0;
  let ev = 0;
  let ac = 0;
  for (const t of leaves) {
    const est = Number(t.estimated_hours) || 0;
    const act = Number(t.actual_hours) || 0;
    const prog = Math.min(100, Math.max(0, Number(t.progress_percent) || 0)) / 100;
    pv += est;
    ev += est * prog;
    ac += act;
  }
  const cpi = ac > 0 ? Math.round((ev / ac) * 100) / 100 : null;
  const spi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : null;
  return {
    planned_value_hours: Math.round(pv * 10) / 10,
    earned_value_hours: Math.round(ev * 10) / 10,
    actual_cost_hours: Math.round(ac * 10) / 10,
    cpi,
    spi,
    task_count: leaves.length,
  };
}
