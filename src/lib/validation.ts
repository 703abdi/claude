import { z } from "zod";

export const taskCreateSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  effort: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  dueTime: z.string().optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  pinnedToday: z.boolean().optional(),
  followUpRequired: z.boolean().optional(),
  followUpDate: z.string().datetime().optional().nullable(),
  followUpPersonId: z.string().optional().nullable(),
  personIds: z.array(z.string()).optional(),
  steps: z.array(z.object({ title: z.string().min(1) })).optional(),
  parentTaskId: z.string().optional().nullable(),
});

export const taskUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  effort: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "WAITING", "COMPLETED"]).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  dueTime: z.string().optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  pinnedToday: z.boolean().optional(),
  followUpRequired: z.boolean().optional(),
  followUpDate: z.string().datetime().optional().nullable(),
  followUpPersonId: z.string().optional().nullable(),
  personIds: z.array(z.string()).optional(),
  position: z.number().optional(),
  parentTaskId: z.string().optional().nullable(),
});

export const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string(), position: z.number() })).min(1),
});

export const stepCreateSchema = z.object({
  title: z.string().min(1).max(500),
});

export const stepUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  done: z.boolean().optional(),
  position: z.number().optional(),
});

export const categoryCreateSchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const categoryUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const personCreateSchema = z.object({
  name: z.string().min(1).max(200),
  notes: z.string().max(5000).optional().nullable(),
});

export const personUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  notes: z.string().max(5000).optional().nullable(),
});

export const dependencySchema = z.object({
  blockerId: z.string(),
});

export const calendarEventCreateSchema = z.object({
  title: z.string().min(1).max(300),
  date: z.string().datetime(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  allDay: z.boolean().optional(),
  location: z.string().max(300).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
  personId: z.string().optional().nullable(),
});

export const calendarEventUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  date: z.string().datetime().optional(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  allDay: z.boolean().optional(),
  location: z.string().max(300).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
  personId: z.string().optional().nullable(),
});

export const agentCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["GROK", "LOCAL"]),
  model: z.string().trim().max(100).optional().nullable(),
  systemPrompt: z.string().max(8000).optional().nullable(),
});

export const agentDispatchSchema = z.object({
  prompt: z.string().trim().min(1).max(20000),
  taskId: z.string().optional().nullable(),
});

export const localPollSchema = z.object({
  agent: z.string().trim().min(1).max(60),
});

export const localCompleteSchema = z.object({
  runId: z.string().min(1),
  agent: z.string().trim().min(1).max(60),
  output: z.string().max(200000).optional().nullable(),
  error: z.string().max(5000).optional().nullable(),
});
