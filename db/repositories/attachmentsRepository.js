import { nextId } from '../runtime/helpers.js';

export function createAttachmentsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  return {
    get attachments() {
      return [...(getData().attachments || [])];
    },

    listAttachments(entityType, entityId) {
      const data = getData();
      if (!data.attachments) data.attachments = [];
      return data.attachments
        .filter((a) => a.entity_type === entityType && a.entity_id === +entityId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },

    findAttachment(id) {
      const data = getData();
      if (!data.attachments) return null;
      return data.attachments.find((a) => a.id === +id) || null;
    },

    addAttachment(row) {
      const data = getData();
      if (!data.attachments) data.attachments = [];
      const id = nextId(data.attachments);
      const now = new Date().toISOString();
      const att = {
        id,
        entity_type: String(row.entity_type),
        entity_id: +row.entity_id,
        kind: row.kind === 'url' ? 'url' : 'file',
        file_name: String(row.file_name || 'file').trim(),
        mime_type: row.mime_type != null ? String(row.mime_type) : null,
        file_size: row.file_size != null ? +row.file_size : null,
        storage_path: row.storage_path != null ? String(row.storage_path) : null,
        external_url: row.external_url != null ? String(row.external_url).trim() || null : null,
        label: row.label != null ? String(row.label).trim() || null : null,
        uploaded_by_user_id: row.uploaded_by_user_id != null ? +row.uploaded_by_user_id : null,
        created_at: row.created_at || now,
      };
      data.attachments.push(att);
      save();
      return id;
    },

    deleteAttachment(id) {
      const data = getData();
      if (!data.attachments) return null;
      const i = data.attachments.findIndex((a) => a.id === +id);
      if (i === -1) return null;
      const [removed] = data.attachments.splice(i, 1);
      save();
      return removed;
    },
  };
}
