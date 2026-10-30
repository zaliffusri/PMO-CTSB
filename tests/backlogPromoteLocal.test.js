import { beforeAll, describe, it, expect } from 'vitest';

/**
 * Local-store promote path (ALLOW_LOCAL_STORE=1) must create a task that
 * update/find can resolve — avoids "Task not found" after → Task.
 */
describe('local backlog → task promote', () => {
  let store;

  beforeAll(async () => {
    process.env.ALLOW_LOCAL_STORE = '1';
    // Ensure query layer treats this as in-memory even if supabase env exists.
    const { store: s, resetLocalDemoData } = await import('../db/store.js');
    store = s;
    resetLocalDemoData();
  });

  it('creates a findable/updatable task from a backlog item', async () => {
    const { buildPromotedTaskFields } = await import('../lib/backlogPromoteFields.js');

    const personId = await store.addPerson({ name: 'Lily Tan', role: 'Consultant' });
    const projectId = await store.addProject({
      name: 'EKutipan+',
      status: 'active',
      classification: 'project',
    });
    const backlog = await store.addBacklog({
      project_id: projectId,
      title: 'Data mismatch in consolidated report',
      item_type: 'inquiry',
      source: 'inquiry',
      status: 'fixed',
      assignee_person_id: personId,
      estimated_hours: 20,
      actual_hours: 16,
      ref_no: 'EK-1088',
    });
    const backlogId = backlog?.id ?? backlog;

    const fields = buildPromotedTaskFields(
      typeof backlog === 'object' ? backlog : await store.findBacklogById(backlogId),
      { assigneeId: personId },
    );
    const taskId = await store.addProjectTask(fields);
    await store.updateBacklog(backlogId, { status: 'in_progress', task_id: taskId });

    const found = await store.findProjectTaskById(taskId);
    expect(found).toBeTruthy();
    expect(found.name).toContain('Data mismatch');
    expect(Number(found.backlog_id)).toBe(Number(backlogId));

    const ok = await store.updateProjectTask(taskId, { progress_percent: 50 });
    expect(ok).toBe(true);

    const updated = await store.findProjectTaskById(String(taskId));
    expect(updated.progress_percent).toBe(50);

    const linked = await store.findBacklogById(backlogId);
    expect(Number(linked.task_id)).toBe(Number(taskId));
  });
});
