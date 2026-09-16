import type { TaskStatus } from "@/lib/types";

const COLOR: Record<TaskStatus, string> = {
  NOT_STARTED: "var(--status-red)",
  IN_PROGRESS: "var(--status-orange)",
  WAITING: "var(--status-yellow)",
  COMPLETED: "var(--status-green)",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting",
  COMPLETED: "Completed",
};

export default function StatusDot({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span
      title={STATUS_LABEL[status]}
      className={`inline-block rounded-full shrink-0 ${className ?? "w-2.5 h-2.5"}`}
      style={{ backgroundColor: COLOR[status] }}
    />
  );
}

export { COLOR as STATUS_COLOR };
