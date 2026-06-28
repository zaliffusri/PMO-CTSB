/** Copy attachment records (and files) to another entity — used on helpdesk → backlog → task. */
export function copyAttachments(store, fromType, fromId, toType, toId) {
  const source = store.listAttachments(fromType, fromId);
  if (!source.length) return 0;
  const existing = store.listAttachments(toType, toId);
  const existingNames = new Set(existing.map((a) => `${a.kind}:${a.file_name}:${a.external_url || a.storage_path}`));
  let copied = 0;
  for (const att of source) {
    const key = `${att.kind}:${att.file_name}:${att.external_url || att.storage_path}`;
    if (existingNames.has(key)) continue;
    store.addAttachment({
      entity_type: toType,
      entity_id: toId,
      kind: att.kind,
      file_name: att.file_name,
      mime_type: att.mime_type,
      file_size: att.file_size,
      storage_path: att.storage_path,
      external_url: att.external_url,
      label: att.label ? `${att.label} (copied)` : null,
      uploaded_by_user_id: att.uploaded_by_user_id,
    });
    copied += 1;
  }
  return copied;
}
