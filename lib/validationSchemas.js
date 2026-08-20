/**
 * Request validation schemas — keep role sets in sync with lib/permissions.js (APP_ROLES).
 */
import { z } from 'zod';

const roleEnum = z.enum(['admin', 'pmo', 'finance', 'hr', 'user']);
// Keep in sync with APP_ROLES in lib/permissions.js

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  email: z.string().trim().email('valid email required').transform((v) => v.toLowerCase()),
  password: z.string().min(6).optional(),
  role: roleEnum.optional().default('user'),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().transform((v) => v.toLowerCase()).optional(),
  password: z.union([z.string().min(6), z.literal(''), z.null()]).optional(),
  role: roleEnum.optional(),
  active: z.boolean().optional(),
}).refine(
  (b) => b.name !== undefined || b.email !== undefined || b.role !== undefined
    || b.password !== undefined || b.active !== undefined,
  { message: 'Nothing to update' },
);

export const createPersonSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  email: z.string().trim().email().optional().nullable().or(z.literal('')),
  role: z.string().trim().optional().nullable(),
  user_id: z.number().int().positive().optional().nullable(),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  description: z.string().optional().nullable(),
  classification: z.string().optional().nullable(),
  engagement_type: z.string().optional().nullable(),
  status: z.string().optional(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  client_ids: z.array(z.number().int().positive()).optional(),
  client_id: z.number().int().positive().optional().nullable(),
});

export const createIssueSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  description: z.string().optional().nullable(),
  status: z.string().optional(),
  priority: z.string().optional(),
  category: z.string().optional(),
  project_id: z.union([z.number().int().positive(), z.string(), z.null()]).optional(),
  client_id: z.union([z.number().int().positive(), z.string(), z.null()]).optional(),
  assignee_person_id: z.union([z.number().int().positive(), z.string(), z.null()]).optional(),
  module_code: z.string().optional().nullable(),
  incident_type: z.string().optional().nullable(),
  intake_channel: z.string().optional().nullable(),
  external_ticket_ref: z.string().optional().nullable(),
  support_level: z.enum(['L1', 'L2', 'L3']).optional(),
}).passthrough();

export const createActivitySchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  type: z.string().trim().min(1, 'type is required'),
  start_at: z.string().min(1, 'start_at is required'),
  end_at: z.string().min(1, 'end_at is required'),
  location: z.string().optional(),
  description: z.string().optional().nullable(),
  project_id: z.union([z.number().int().positive(), z.string(), z.null()]).optional(),
  person_id: z.union([z.number().int().positive(), z.string(), z.null()]).optional(),
  person_ids: z.array(z.union([z.number(), z.string()])).optional(),
  external_attendees: z.string().optional().nullable(),
  activity_group_id: z.string().optional().nullable(),
  notify_email: z.union([z.boolean(), z.string(), z.number()]).optional(),
}).passthrough();

export const promoteBacklogSchema = z.object({
  project_id: z.union([z.number().int().positive(), z.string()]),
  assignee_person_id: z.union([z.number().int().positive(), z.string()]),
}).passthrough();
