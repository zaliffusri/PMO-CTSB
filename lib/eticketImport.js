import {
  parseIncidentType,
  categoryForIncidentType,
  parseIntakeChannel,
} from './issueConstants.js';
import {
  moduleCodeFromLabel,
  parseModuleCodeFromTicketId,
  moduleLabelForCode,
  normalizeModuleCode,
} from './epbtModules.js';

function cleanRef(value) {
  if (value == null) return null;
  let v = String(value).trim();
  if (!v || v === '[]') return null;
  v = v.replace(/^Ticket\s*#?\s*/i, '').trim();
  return v || null;
}

function parseEticketDate(value) {
  if (!value || !String(value).trim()) return null;
  const d = new Date(String(value).trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapEticketStatus(status, supportLevel) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'closed' || s === 'resolved') return { status: 'closed', support_level: supportLevel };
  if (s.includes('inprogress') || s.includes('in progress')) return { status: 'in_progress', support_level: supportLevel };
  if (s.includes('escalate') && s.includes('2')) return { status: 'open', support_level: 'L2' };
  if (s.includes('escalate') && s.includes('3')) return { status: 'open', support_level: 'L2' };
  return { status: 'open', support_level: supportLevel || 'L1' };
}

function titleFromDescription(desc, ticketId) {
  const text = String(desc || '').replace(/\s+/g, ' ').trim();
  if (!text) return ticketId || 'Imported ticket';
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

/**
 * Map one eTicket CSV row object to store.addIssue() payload.
 */
export function mapEticketRowToIssue(row, { clientId = null, reporterUserId = null } = {}) {
  const ticketNo = String(row.TicketID || row.ticket_id || '').trim();
  const moduleCode = parseModuleCodeFromTicketId(ticketNo)
    || moduleCodeFromLabel(row.Module)
    || 'XXX';
  const epbtModule = row.Module ? String(row.Module).trim() : moduleLabelForCode(moduleCode);
  const incidentType = parseIncidentType(row['Incident Type']) || 'issue';
  const intake = parseIntakeChannel(row.Medium);
  const l1 = row['1st Level'] ? String(row['1st Level']).trim() : null;
  const l2 = row['2nd Level'] ? String(row['2nd Level']).trim() : null;
  let supportLevel = 'L1';
  if (l2) supportLevel = 'L2';
  const statusMap = mapEticketStatus(row.Status, supportLevel);
  const pbl = cleanRef(row.PBLID);
  const backlogRef = pbl && !pbl.startsWith('[') ? pbl : null;

  const resolutionMethod = intake && ['whatsapp', 'call', 'email'].includes(intake)
    ? (intake === 'call' ? 'call' : intake)
    : null;

  return {
    ticket_no: ticketNo || undefined,
    title: titleFromDescription(row['Issue Description'], ticketNo),
    description: row['Issue Description'] != null ? String(row['Issue Description']) : null,
    external_ticket_ref: cleanRef(row['Ref Helpdesk Ticket']),
    client_id: clientId,
    reporter_user_id: reporterUserId,
    incident_type: incidentType,
    category: categoryForIncidentType(incidentType),
    module_code: normalizeModuleCode(moduleCode),
    epbt_module: epbtModule,
    intake_channel: intake,
    client_pic: row.PIC ? String(row.PIC).trim() || null : null,
    action_taken: row.Action ? String(row.Action).trim() || null : null,
    l1_assignee_label: l1,
    l2_assignee_label: l2,
    backlog_ref: backlogRef,
    issue_attachment_ref: row.Issue ? String(row.Issue).trim() || null : null,
    resolution_attachment_ref: row.Resolution ? String(row.Resolution).trim() || null : null,
    status: statusMap.status,
    support_level: statusMap.support_level,
    resolution_method: row.Status && String(row.Status).toLowerCase() === 'closed' ? resolutionMethod : null,
    resolution_notes: row.Action && String(row.Status).toLowerCase() === 'closed'
      ? String(row.Action).slice(0, 500)
      : null,
    created_at: parseEticketDate(row.Created),
    updated_at: parseEticketDate(row.Modified),
    resolved_at: parseEticketDate(row.Resolved),
  };
}

/** Minimal RFC4180-style CSV parser for quoted multiline fields */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);

  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] != null ? cells[idx] : '';
    });
    return obj;
  });
}

export function personLabelFromUser(user) {
  if (!user) return null;
  return user.name ? `CTSB | ${user.name}` : null;
}
