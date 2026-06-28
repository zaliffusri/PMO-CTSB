import { normalizeModuleCode } from './epbtModules.js';

/**
 * Next ticket number in legacy eTicket format: eT-CK-0165
 */
export function nextEticketNo(issues = [], moduleCode = 'XXX') {
  const code = normalizeModuleCode(moduleCode);
  const prefix = `eT-${code}-`;
  const nums = (issues || [])
    .filter((i) => i.ticket_no && String(i.ticket_no).toUpperCase().startsWith(prefix.toUpperCase()))
    .map((i) => {
      const part = String(i.ticket_no).slice(prefix.length);
      return parseInt(part, 10);
    })
    .filter((n) => Number.isFinite(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}
