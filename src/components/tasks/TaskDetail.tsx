"use client";

import { useState } from "react";
import type { Task, Category } from "@/lib/types";
import { api } from "@/lib/api-client";
import Avatar from "@/components/shared/Avatar";

export default function TaskDetail({
  task,
  categories,
  people,
  allTasks,
  onChange,
  onDelete,
  onCycleEffort,
}: {
  task: Task;
  categories: Category[];
  people: { id: string; name: string }[];
  allTasks: { id: string; title: string }[];
  onChange: (task: Task) => void;
  onDelete: (id: string) => void;
  onCycleEffort: (e: React.MouseEvent) => void;
}) {
  const [newStep, setNewStep] = useState("");
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [location, setLocation] = useState(task.location ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(data: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.tasks.update(task.id, data);
      onChange(updated);
    } catch {
      setError("Couldn't save that change. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStep(stepId: string, done: boolean) {
    const updated = await api.tasks.updateStep(task.id, stepId, { done });
    onChange(updated);
  }

  async function addStep() {
    if (!newStep.trim()) return;
    const updated = await api.tasks.addStep(task.id, newStep.trim());
    onChange(updated);
    setNewStep("");
  }

  async function deleteStep(stepId: string) {
    const updated = await api.tasks.deleteStep(task.id, stepId);
    onChange(updated);
  }

  async function renameStep(stepId: string, value: string) {
    const updated = await api.tasks.updateStep(task.id, stepId, { title: value });
    onChange(updated);
  }

  async function moveStep(index: number, dir: -1 | 1) {
    const steps = [...task.steps];
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
    const items = steps.map((s, i) => ({ id: s.id, position: (i + 1) * 1000 }));
    await api.tasks.reorderSteps(task.id, items);
    onChange({ ...task, steps: steps.map((s, i) => ({ ...s, position: items[i].position })) });
  }

  async function togglePerson(personId: string) {
    const has = task.people.some((p) => p.id === personId);
    const personIds = has
      ? task.people.filter((p) => p.id !== personId).map((p) => p.id)
      : [...task.people.map((p) => p.id), personId];
    await patch({ personIds });
  }

  const blockerOptions = allTasks.filter(
    (t) => t.id !== task.id && !task.blockedBy.some((b) => b.id === t.id)
  );

  async function addDependency(blockerId: string) {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.tasks.addDependency(task.id, blockerId);
      onChange(updated);
    } catch {
      setError("Couldn't add that dependency. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function removeDependency(blockerId: string) {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.tasks.removeDependency(task.id, blockerId);
      onChange(updated);
    } catch {
      setError("Couldn't remove that dependency. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    await api.tasks.delete(task.id);
    onDelete(task.id);
  }

  return (
    <div className="border-t border-border px-4 py-4 space-y-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
      {/* Title / description */}
      <div className="grid gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && patch({ title: title.trim() })}
          className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-muted-2 outline-none font-bold text-[15px] py-1"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (task.description ?? "") && patch({ description: description || null })}
          placeholder="Add a description..."
          rows={2}
          className="w-full bg-surface-2 border border-border rounded-md px-2.5 py-2 text-sm text-muted resize-none outline-none focus:border-muted-2"
        />
      </div>

      {task.aiPriorityReason && task.aiPriorityScore !== null && task.aiPriorityScore > 0 && (
        <div className="flex items-start gap-2 text-xs border border-border rounded-md px-2.5 py-2 text-muted">
          <span className="text-muted-2 shrink-0">AI:</span>
          <span>{task.aiPriorityReason}</span>
          {!task.pinnedToday && (
            <button
              onClick={() => patch({ pinnedToday: true })}
              className="ml-auto shrink-0 text-foreground hover:underline"
            >
              Pin to Today
            </button>
          )}
        </div>
      )}

      {/* Steps */}
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-2 font-semibold mb-1.5">Steps</p>
        <div className="space-y-1">
          {task.steps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-2 group/step">
              <input
                type="checkbox"
                checked={step.done}
                onChange={(e) => toggleStep(step.id, e.target.checked)}
                className="w-4 h-4 accent-current shrink-0"
              />
              <input
                defaultValue={step.title}
                onBlur={(e) => e.target.value.trim() && e.target.value !== step.title && renameStep(step.id, e.target.value.trim())}
                className={`flex-1 bg-transparent outline-none text-sm py-0.5 ${step.done ? "line-through text-muted" : ""}`}
              />
              <button
                onClick={() => moveStep(i, -1)}
                disabled={i === 0}
                className="text-muted-2 hover:text-foreground disabled:opacity-20 text-xs px-1"
              >
                ↑
              </button>
              <button
                onClick={() => moveStep(i, 1)}
                disabled={i === task.steps.length - 1}
                className="text-muted-2 hover:text-foreground disabled:opacity-20 text-xs px-1"
              >
                ↓
              </button>
              <button
                onClick={() => deleteStep(step.id)}
                className="text-muted-2 hover:text-status-red text-xs px-1 opacity-0 group-hover/step:opacity-100 transition-opacity"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addStep()}
            placeholder="Add a step..."
            className="flex-1 bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-muted-2"
          />
          <button onClick={addStep} className="text-xs text-muted hover:text-foreground px-2">
            Add
          </button>
        </div>
      </div>

      {/* Attributes grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <Field label="Category">
          <select
            value={task.category?.id ?? ""}
            onChange={(e) => patch({ categoryId: e.target.value || null })}
            className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 outline-none"
          >
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Effort">
          <button
            onClick={onCycleEffort}
            className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 text-left hover:border-muted-2"
          >
            {task.effort[0]}
            {task.effort.slice(1).toLowerCase()}
          </button>
        </Field>

        <Field label="Due date">
          <input
            type="date"
            value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
            onChange={(e) =>
              patch({ dueDate: e.target.value ? new Date(e.target.value + "T09:00:00").toISOString() : null })
            }
            className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 outline-none"
          />
        </Field>

        <Field label="Due time">
          <input
            type="time"
            value={task.dueTime ?? ""}
            onChange={(e) => patch({ dueTime: e.target.value || null })}
            className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 outline-none"
          />
        </Field>

        <Field label="Status">
          <select
            value={task.status}
            onChange={(e) => patch({ status: e.target.value })}
            className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 outline-none"
          >
            <option value="NOT_STARTED">Not started</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="WAITING">Waiting</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </Field>

        <Field label="Location">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onBlur={() => location !== (task.location ?? "") && patch({ location: location || null })}
            className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 outline-none"
          />
        </Field>
      </div>

      {/* Follow-up */}
      <div className="border border-border rounded-md p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={task.followUpRequired}
            onChange={(e) => patch({ followUpRequired: e.target.checked })}
            className="w-4 h-4"
          />
          Follow-up required
        </label>
        {task.followUpRequired && (
          <div className="grid grid-cols-2 gap-3 pl-6">
            <Field label="Follow up on">
              <input
                type="date"
                value={task.followUpDate ? task.followUpDate.slice(0, 10) : ""}
                onChange={(e) =>
                  patch({
                    followUpDate: e.target.value ? new Date(e.target.value + "T09:00:00").toISOString() : null,
                  })
                }
                className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm outline-none"
              />
            </Field>
            <Field label="With">
              <select
                value={task.followUpPerson?.id ?? ""}
                onChange={(e) => patch({ followUpPersonId: e.target.value || null })}
                className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm outline-none"
              >
                <option value="">Nobody</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </div>

      {/* People */}
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-2 font-semibold mb-1.5">People</p>
        <div className="flex flex-wrap gap-1.5">
          {people.map((p) => {
            const active = task.people.some((tp) => tp.id === p.id);
            return (
              <button
                key={p.id}
                onClick={() => togglePerson(p.id)}
                className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border transition-colors ${
                  active ? "border-foreground/40 bg-surface-2 text-foreground" : "border-border text-muted"
                }`}
              >
                <Avatar name={p.name} size="sm" className="w-5 h-5 text-[9px]" />
                <span className="text-xs">{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Blocked by */}
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-2 font-semibold mb-1.5">Blocked by</p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {task.blockedBy.map((b) => (
            <span
              key={b.id}
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-border ${
                b.status === "COMPLETED" ? "text-muted line-through" : "text-status-red"
              }`}
            >
              {b.title}
              <button onClick={() => removeDependency(b.id)} className="text-muted-2 hover:text-foreground">
                ✕
              </button>
            </span>
          ))}
          {task.blockedBy.length === 0 && <span className="text-xs text-muted-2">Nothing blocking this.</span>}
        </div>
        {blockerOptions.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && addDependency(e.target.value)}
            className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs outline-none"
          >
            <option value="">+ Add blocker...</option>
            {blockerOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Notes */}
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-2 font-semibold mb-1.5">Notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (task.notes ?? "") && patch({ notes: notes || null })}
          rows={2}
          className="w-full bg-surface-2 border border-border rounded-md px-2.5 py-2 text-sm resize-none outline-none focus:border-muted-2"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-muted-2">
          {error ? <span className="text-status-red">{error}</span> : saving ? "Saving..." : task.isSeed ? "Seed data" : ""}
        </span>
        <button onClick={handleDelete} className="text-xs text-status-red hover:underline">
          Delete task
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-muted-2 mb-1">{label}</span>
      {children}
    </label>
  );
}
