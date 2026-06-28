/** Escape text for HTML email bodies. */
export function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const TYPE_COLORS = {
  meeting: '#3b82f6',
  outstation: '#f59e0b',
  other: '#64748b',
  uat: '#8b5cf6',
  urs: '#06b6d4',
  fat: '#ec4899',
  demo: '#14b8a6',
  training: '#22c55e',
  'go-live': '#ef4444',
  tender: '#6366f1',
};

export function activityTypeBadgeHtml(typeKey, label) {
  const color = TYPE_COLORS[typeKey] || TYPE_COLORS.other;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#fff;background:${color};">${escapeHtml(label)}</span>`;
}

/**
 * Table-based layout for broad email client support.
 */
export function wrapEmailLayout({
  title,
  preheader = '',
  bodyHtml,
  orgName = 'PMO CTSB',
  footerNote = 'This message was sent from PMO CTSB. Please do not reply to this automated email.',
  ctaUrl,
  ctaLabel,
}) {
  const ctaBlock =
    ctaUrl && ctaLabel
      ? `<tr><td style="padding:24px 32px 8px;">
          <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px;">${escapeHtml(ctaLabel)}</a>
        </td></tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#059669 0%,#10b981 50%,#34d399 100%);padding:28px 32px;">
              <div style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.85);margin-bottom:6px;">${escapeHtml(orgName)}</div>
              <div style="font-size:22px;font-weight:700;line-height:1.3;color:#ffffff;">${escapeHtml(title)}</div>
            </td>
          </tr>
          <tr><td style="padding:28px 32px 8px;font-size:15px;line-height:1.6;color:#334155;">${bodyHtml}</td></tr>
          ${ctaBlock}
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#94a3b8;">
              ${escapeHtml(footerNote)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function detailRow(label, value) {
  if (value == null || value === '') return '';
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:#64748b;width:110px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:500;">${escapeHtml(value)}</td>
  </tr>`;
}

export function buildActivityNotificationEmail({
  recipientName,
  title,
  typeLabel,
  typeKey,
  location,
  startAt,
  endAt,
  projectName,
  description,
  loggedBy,
  orgName,
}) {
  const greeting = `<p style="margin:0 0 16px;font-size:15px;">Hi <strong>${escapeHtml(recipientName || 'team member')}</strong>,</p>
    <p style="margin:0 0 20px;">You have been scheduled for the following activity:</p>`;

  const badge = activityTypeBadgeHtml(typeKey, typeLabel);
  const details = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:4px 16px;margin:0 0 8px;">
    ${detailRow('Activity', title)}
    <tr><td style="padding:6px 0;font-size:13px;color:#64748b;width:110px;vertical-align:top;">Type</td><td style="padding:6px 0;">${badge}</td></tr>
    ${detailRow('When', `${startAt} → ${endAt}`)}
    ${detailRow('Location', location)}
    ${detailRow('Project', projectName)}
    ${detailRow('Notes', description)}
    ${detailRow('Scheduled by', loggedBy)}
  </table>`;

  const html = wrapEmailLayout({
    title: 'Activity scheduled',
    preheader: `${title} — ${startAt}`,
    orgName,
    bodyHtml: greeting + details,
    ctaLabel: 'Open calendar',
    ctaUrl: process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/calendar` : undefined,
  });

  const text = [
    `Hi ${recipientName || 'team member'},`,
    '',
    'You have been scheduled for the following activity:',
    '',
    `Title: ${title}`,
    `Type: ${typeLabel}`,
    `When: ${startAt} → ${endAt}`,
    location ? `Location: ${location}` : null,
    projectName ? `Project: ${projectName}` : null,
    description ? `Notes: ${description}` : null,
    loggedBy ? `Scheduled by: ${loggedBy}` : null,
    '',
    'Open PMO CTSB → Calendar & Activities for details.',
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text, subject: `PMO CTSB: Activity scheduled — ${title}` };
}

function formatScheduleRow(a) {
  const time = a.timeLabel || `${a.startAt} – ${a.endAt}`;
  return `<tr style="border-bottom:1px solid #e2e8f0;">
    <td style="padding:12px 10px;font-size:13px;color:#0f172a;white-space:nowrap;vertical-align:top;">${escapeHtml(a.dateLabel)}</td>
    <td style="padding:12px 10px;font-size:12px;color:#64748b;white-space:nowrap;vertical-align:top;">${escapeHtml(time)}</td>
    <td style="padding:12px 10px;vertical-align:top;">${activityTypeBadgeHtml(a.typeKey, a.typeLabel)}</td>
    <td style="padding:12px 10px;font-size:14px;color:#0f172a;font-weight:600;vertical-align:top;">${escapeHtml(a.title)}</td>
    <td style="padding:12px 10px;font-size:13px;color:#475569;vertical-align:top;">${escapeHtml(a.assignees || '—')}</td>
    <td style="padding:12px 10px;font-size:13px;color:#475569;vertical-align:top;">${escapeHtml(a.location || '—')}</td>
    <td style="padding:12px 10px;font-size:13px;color:#475569;vertical-align:top;">${escapeHtml(a.projectName || '—')}</td>
  </tr>`;
}

export function buildTeamScheduleEmail({
  recipientName,
  periodLabel,
  activities,
  customMessage,
  sentBy,
  orgName,
}) {
  const intro = `<p style="margin:0 0 12px;font-size:15px;">Hi <strong>${escapeHtml(recipientName || 'team')}</strong>,</p>
    <p style="margin:0 0 8px;">Here is the team activity schedule for <strong>${escapeHtml(periodLabel)}</strong>.</p>
    ${customMessage ? `<p style="margin:0 0 16px;padding:12px 14px;background:#ecfdf5;border-left:4px solid #10b981;border-radius:6px;font-size:14px;color:#065f46;">${escapeHtml(customMessage)}</p>` : ''}
    ${sentBy ? `<p style="margin:0 0 16px;font-size:13px;color:#64748b;">Sent by ${escapeHtml(sentBy)}</p>` : ''}`;

  const rows = activities.length
    ? activities.map(formatScheduleRow).join('')
  : `<tr><td colspan="7" style="padding:20px;text-align:center;color:#94a3b8;font-size:14px;">No activities in this period.</td></tr>`;

  const table = `<div style="overflow-x:auto;margin-top:8px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;min-width:520px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th align="left" style="padding:10px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Date</th>
          <th align="left" style="padding:10px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Time</th>
          <th align="left" style="padding:10px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Type</th>
          <th align="left" style="padding:10px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Title</th>
          <th align="left" style="padding:10px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Team</th>
          <th align="left" style="padding:10px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Location</th>
          <th align="left" style="padding:10px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Project</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <p style="margin:16px 0 0;font-size:13px;color:#64748b;">${activities.length} ${activities.length === 1 ? 'activity' : 'activities'} listed.</p>`;

  const html = wrapEmailLayout({
    title: 'Team activity schedule',
    preheader: `${periodLabel} — ${activities.length} activities`,
    orgName,
    bodyHtml: intro + table,
    ctaLabel: 'View in PMO CTSB',
    ctaUrl: process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/calendar` : undefined,
  });

  const textLines = [
    `Hi ${recipientName || 'team'},`,
    '',
    `Team activity schedule for ${periodLabel}.`,
    customMessage ? `\n${customMessage}\n` : null,
    sentBy ? `Sent by: ${sentBy}` : null,
    '',
  ].filter((x) => x !== null);

  activities.forEach((a) => {
    textLines.push(
      `• ${a.dateLabel} | ${a.timeLabel || `${a.startAt} – ${a.endAt}`} | ${a.typeLabel} | ${a.title} | ${a.assignees || '—'} | ${a.location || '—'}`,
    );
  });
  textLines.push('', 'Open PMO CTSB → Calendar & Activities.');

  return {
    html,
    text: textLines.join('\n'),
    subject: `PMO CTSB: Team schedule — ${periodLabel}`,
  };
}
