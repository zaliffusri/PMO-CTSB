import { describe, it, expect } from 'vitest';
import { parseCsv, mapEticketRowToIssue } from '../lib/eticketImport.js';
import { nextEticketNo } from '../lib/issueTicketNo.js';

describe('eticketImport', () => {
  it('parses quoted CSV rows', () => {
    const csv = 'TicketID,Module,Issue Description\n"eT-CK-0001","Cukai","Login failed"';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].TicketID).toBe('eT-CK-0001');
    expect(rows[0]['Issue Description']).toBe('Login failed');
  });

  it('maps eTicket row to issue payload', () => {
    const row = {
      TicketID: 'eT-CK-0165',
      Module: 'Cukai',
      'Incident Type': 'Bug / Defect',
      Medium: 'WhatsApp',
      'Ref Helpdesk Ticket': 'Ticket #QA-99',
      PIC: 'Ali',
      'Issue Description': 'Cannot print bill',
      '1st Level': 'CTSB | Ahmad',
      Status: 'Closed',
      Action: 'Reset cache and retest',
      PBLID: 'PBL-2026-001',
    };
    const issue = mapEticketRowToIssue(row, { clientId: 5 });
    expect(issue.ticket_no).toBe('eT-CK-0165');
    expect(issue.module_code).toBe('CK');
    expect(issue.incident_type).toBe('bug_defect');
    expect(issue.intake_channel).toBe('whatsapp');
    expect(issue.external_ticket_ref).toBe('QA-99');
    expect(issue.client_pic).toBe('Ali');
    expect(issue.l1_assignee_label).toBe('CTSB | Ahmad');
    expect(issue.backlog_ref).toBe('PBL-2026-001');
    expect(issue.status).toBe('closed');
    expect(issue.client_id).toBe(5);
  });
});

describe('issueTicketNo', () => {
  it('generates next ticket number per module', () => {
    const issues = [
      { ticket_no: 'eT-CK-0003' },
      { ticket_no: 'eT-CK-0010' },
      { ticket_no: 'eT-PN-0001' },
    ];
    expect(nextEticketNo(issues, 'CK')).toBe('eT-CK-0011');
    expect(nextEticketNo(issues, 'PN')).toBe('eT-PN-0002');
    expect(nextEticketNo([], 'LSN')).toBe('eT-LSN-0001');
  });
});
