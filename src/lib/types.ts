export type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "WAITING" | "COMPLETED";
export type Effort = "LOW" | "MEDIUM" | "HIGH";
export type Bucket = "TODAY" | "NOW" | "NEXT" | "LATER";

export type Category = {
  id: string;
  name: string;
  color: string;
  isSeed?: boolean;
};

export type Person = {
  id: string;
  name: string;
  notes: string | null;
  isSeed?: boolean;
};

export type TaskStep = {
  id: string;
  title: string;
  done: boolean;
  position: number;
  doneAt: string | null;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  effort: Effort;
  position: number;
  aiPriorityScore: number | null;
  aiPriorityReason: string | null;
  pinnedToday: boolean;
  category: Category | null;
  dueDate: string | null;
  dueTime: string | null;
  location: string | null;
  notes: string | null;
  followUpRequired: boolean;
  followUpDate: string | null;
  followUpPerson: Person | null;
  parentTaskId: string | null;
  createdAt: string;
  startedAt: string | null;
  waitingAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  isSeed: boolean;
  steps: TaskStep[];
  people: Person[];
  blockedBy: { id: string; title: string; status: TaskStatus }[];
  blocks: { id: string; title: string; status: TaskStatus }[];
  bucket: Bucket;
  dateBucket: Exclude<Bucket, "TODAY">;
  overdue: boolean;
  isBlocked: boolean;
};
