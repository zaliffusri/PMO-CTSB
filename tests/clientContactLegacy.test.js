import { describe, it, expect } from 'vitest';
import {
  parseLegacyContactBlob,
  expandClientContacts,
  repairLegacyClientContacts,
  isLegacyContactBlob,
} from '../lib/clientContactLegacy.js';

const SAMPLE = '__pmo_contacts__:{"contacts":[{"name":"SYARIZA BINTI MOHAMMAD SHARIF","title":"Pegawai Teknologi Maklumat","email":"syariza@mbpg.gov.my","phone":"0197365305"},{"name":"NOORUL AZHANI BINTI MD SALLEH","title":"Penolong Pegawai Teknologi Maklumat","email":"noorul.azhani@mbpg.gov.my","phone":"0179818276"}],"category":"pbt"}';

describe('clientContactLegacy', () => {
  it('detects legacy blob', () => {
    expect(isLegacyContactBlob(SAMPLE)).toBe(true);
    expect(isLegacyContactBlob('Ahmad')).toBe(false);
  });

  it('parses contacts from blob', () => {
    const blob = parseLegacyContactBlob(SAMPLE);
    expect(blob.contacts).toHaveLength(2);
    expect(blob.category).toBe('pbt');
  });

  it('expands legacy row for display', () => {
    const expanded = expandClientContacts([
      { id: 1, client_id: 5, contact_name: SAMPLE, email: 'syariza@mbpg.gov.my', phone: '0197365305' },
    ]);
    expect(expanded).toHaveLength(2);
    expect(expanded[0].contact_name).toBe('SYARIZA BINTI MOHAMMAD SHARIF');
    expect(expanded[0].title).toBe('Pegawai Teknologi Maklumat');
  });

  it('repairs legacy rows in store', async () => {
    const data = { clients: [{ id: 5, name: 'MBPG' }], client_contacts: [] };
    let nextId = 1;
    const store = {
      async listClients() {
        return data.clients;
      },
      async getClientContacts(clientId) {
        return data.client_contacts.filter((c) => c.client_id === clientId);
      },
      async addClientContact(row) {
        const id = nextId++;
        data.client_contacts.push({ id, ...row });
        return id;
      },
      async deleteClientContact(id) {
        const i = data.client_contacts.findIndex((c) => c.id === id);
        if (i >= 0) data.client_contacts.splice(i, 1);
      },
    };
    await store.addClientContact({
      client_id: 5,
      contact_name: SAMPLE,
      email: 'syariza@mbpg.gov.my',
      phone: '0197365305',
    });
    const n = await repairLegacyClientContacts(store, 5);
    expect(n).toBe(2);
    expect(data.client_contacts).toHaveLength(2);
    expect(data.client_contacts[0].contact_name).toBe('SYARIZA BINTI MOHAMMAD SHARIF');
    expect(data.client_contacts.some((c) => c.contact_name?.includes('__pmo_contacts__'))).toBe(false);
  });
});
