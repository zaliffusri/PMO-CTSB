import { nextId } from '../runtime/helpers.js';
import { isDbMode, dbSelect, dbInsert, dbDelete } from '../runtime/query.js';

function buildAttachmentPayload(row, { now = new Date().toISOString() } = {}) {
  return {
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
}

export function createAttachmentsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  return {
    /** @deprecated Prefer listAttachments() — sync getter is local-only. */
    get attachments() {
      return [...(getData().attachments || [])];
    },

    async listAttachments(entityType, entityId) {
      if (!isDbMode()) {
        const data = getData();
        if (!data.attachments) data.attachments = [];
        return data.attachments
          .filter((a) => a.entity_type === entityType && a.entity_id === +entityId)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }
      const rows = await dbSelect('attachments_app', {
        filters: { entity_type: entityType, entity_id: +entityId },
        order: 'created_at',
        ascending: false,
      });
      return rows;
    },

    async findAttachment(id) {
      if (!isDbMode()) {
        const data = getData();
        if (!data.attachments) return null;
        return data.attachments.find((a) => a.id === +id) || null;
      }
      return dbSelect('attachments_app', { filters: { id: +id }, maybeSingle: true });
    },

    async addAttachment(row) {
      const now = new Date().toISOString();
      const payload = buildAttachmentPayload(row, { now });
      if (!isDbMode()) {
        const data = getData();
        if (!data.attachments) data.attachments = [];
        const id = nextId(data.attachments);
        data.attachments.push({ id, ...payload });
        save();
        return id;
      }
      const saved = await dbInsert('attachments_app', payload);
      return saved.id;
    },

    async deleteAttachment(id) {
      if (!isDbMode()) {
        const data = getData();
        if (!data.attachments) return null;
        const i = data.attachments.findIndex((a) => a.id === +id);
        if (i === -1) return null;
        const [removed] = data.attachments.splice(i, 1);
        save();
        return removed;
      }
      const existing = await dbSelect('attachments_app', {
        filters: { id: +id },
        maybeSingle: true,
      });
      if (!existing) return null;
      await dbDelete('attachments_app', +id);
      return existing;
    },
  };
}
