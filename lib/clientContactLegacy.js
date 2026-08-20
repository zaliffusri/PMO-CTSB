/** Legacy import stored PIC JSON in contact_name as __pmo_contacts__:{...} */

export const LEGACY_CONTACT_PREFIX = '__pmo_contacts__:';

export function isLegacyContactBlob(value) {
  return typeof value === 'string' && value.trim().startsWith(LEGACY_CONTACT_PREFIX);
}

export function parseLegacyContactBlob(value) {
  if (!isLegacyContactBlob(value)) return null;
  try {
    const parsed = JSON.parse(value.trim().slice(LEGACY_CONTACT_PREFIX.length));
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Expand one legacy row into display/API contact objects. */
export function expandLegacyContactRow(contact) {
  const blob = parseLegacyContactBlob(contact?.contact_name);
  if (!blob?.contacts?.length) return [contact];

  return blob.contacts.map((c, index) => ({
    ...contact,
    id: contact.id * 1000 + index + 1,
    _legacy_source_id: contact.id,
    contact_name: c.name || c.contact_name || null,
    title: c.title || null,
    email: c.email || null,
    phone: c.phone || null,
    category: blob.category || null,
    _legacy_expanded: true,
  }));
}

export function expandClientContacts(contacts = []) {
  return contacts.flatMap((cc) => expandLegacyContactRow(cc));
}

/**
 * Replace legacy blob row(s) with normal client_contacts rows.
 * @returns {Promise<number>} rows created
 */
export async function repairLegacyClientContacts(store, clientId) {
  const contacts = await store.getClientContacts(clientId);
  let created = 0;

  for (const cc of [...contacts]) {
    const blob = parseLegacyContactBlob(cc.contact_name);
    if (!blob?.contacts?.length) continue;

    await store.deleteClientContact(cc.id);
    for (const c of blob.contacts) {
      await store.addClientContact({
        client_id: clientId,
        contact_name: c.name || c.contact_name || null,
        email: c.email || null,
        phone: c.phone || null,
      });
      created += 1;
    }
  }

  return created;
}

export async function repairAllLegacyClientContacts(store) {
  let clientsTouched = 0;
  let contactsCreated = 0;
  const clients = await store.listClients();
  for (const client of clients || []) {
    const n = await repairLegacyClientContacts(store, client.id);
    if (n > 0) {
      clientsTouched += 1;
      contactsCreated += n;
    }
  }
  return { clientsTouched, contactsCreated };
}
