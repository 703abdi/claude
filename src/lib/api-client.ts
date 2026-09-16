import type { Task, Category, Person, Effort, CalendarEvent, Suggestion } from "./types";

export type TaskCreateInput = {
  title: string;
  description?: string | null;
  categoryId?: string | null;
  effort?: Effort;
  dueDate?: string | null;
  dueTime?: string | null;
  location?: string | null;
  notes?: string | null;
  pinnedToday?: boolean;
  followUpRequired?: boolean;
  followUpDate?: string | null;
  followUpPersonId?: string | null;
  personIds?: string[];
  steps?: { title: string }[];
  parentTaskId?: string | null;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  tasks: {
    list: (params?: Record<string, string>) =>
      request<Task[]>(`/api/tasks${params ? "?" + new URLSearchParams(params) : ""}`),
    create: (data: TaskCreateInput) => request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/api/tasks/${id}`, { method: "DELETE" }),
    reorder: (items: { id: string; position: number }[]) =>
      request<{ ok: boolean }>("/api/tasks/reorder", { method: "POST", body: JSON.stringify({ items }) }),
    addStep: (taskId: string, title: string) =>
      request<Task>(`/api/tasks/${taskId}/steps`, { method: "POST", body: JSON.stringify({ title }) }),
    updateStep: (taskId: string, stepId: string, data: { title?: string; done?: boolean; position?: number }) =>
      request<Task>(`/api/tasks/${taskId}/steps/${stepId}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteStep: (taskId: string, stepId: string) =>
      request<Task>(`/api/tasks/${taskId}/steps/${stepId}`, { method: "DELETE" }),
    reorderSteps: (taskId: string, items: { id: string; position: number }[]) =>
      request<{ ok: boolean }>(`/api/tasks/${taskId}/steps/reorder`, {
        method: "POST",
        body: JSON.stringify({ items }),
      }),
    addDependency: (taskId: string, blockerId: string) =>
      request<Task>(`/api/tasks/${taskId}/dependencies`, { method: "POST", body: JSON.stringify({ blockerId }) }),
    removeDependency: (taskId: string, blockerId: string) =>
      request<Task>(`/api/tasks/${taskId}/dependencies?blockerId=${blockerId}`, { method: "DELETE" }),
  },
  categories: {
    list: () => request<Category[]>("/api/categories"),
    create: (data: { name: string; color: string }) =>
      request<Category>("/api/categories", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ name: string; color: string }>) =>
      request<Category>(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/api/categories/${id}`, { method: "DELETE" }),
  },
  people: {
    list: () => request<(Person & { activeCount: number; waitingCount: number; completedCount: number; upcomingCount: number })[]>(
      "/api/people"
    ),
    create: (data: { name: string; notes?: string | null }) =>
      request<Person>("/api/people", { method: "POST", body: JSON.stringify(data) }),
    get: (id: string) => request<Record<string, unknown>>(`/api/people/${id}`),
    update: (id: string, data: Partial<{ name: string; notes: string | null }>) =>
      request<Person>(`/api/people/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/api/people/${id}`, { method: "DELETE" }),
  },
  calendarEvents: {
    list: (params?: { from?: string; to?: string }) =>
      request<CalendarEvent[]>(`/api/calendar-events${params ? "?" + new URLSearchParams(params) : ""}`),
    create: (data: Partial<CalendarEvent> & { title: string; date: string; categoryId?: string | null; taskId?: string | null; personId?: string | null }) =>
      request<CalendarEvent>("/api/calendar-events", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<CalendarEvent>(`/api/calendar-events/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/api/calendar-events/${id}`, { method: "DELETE" }),
  },
  suggestions: {
    list: () => request<Suggestion[]>("/api/suggestions"),
    resolve: (id: string, action: "accept" | "reject" | "dismiss" | "snooze" | "edit", extra?: Record<string, unknown>) =>
      request<{ ok: boolean; taskId?: string }>(`/api/suggestions/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ action, ...extra }),
      }),
  },
};
