import { PrismaClient, TaskStatus, Effort, ContextSourceType, ContextType, SuggestionType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
function daysFromNow(n: number) {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return new Date(d.getTime() + n * DAY);
}

async function ensureAdminUser() {
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!email || !password) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin user creation.");
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash, name: "abdi" },
  });
  console.log(`Admin user ready: ${email}`);
}

async function ensureCategories() {
  const categories = [
    { name: "Business", color: "#3b82f6" },
    { name: "Trading Offer", color: "#6366f1" },
    { name: "Clients", color: "#8b5cf6" },
    { name: "Personal", color: "#14b8a6" },
    { name: "Relationships", color: "#f43f5e" },
    { name: "Operations", color: "#64748b" },
    { name: "Content", color: "#ec4899" },
    { name: "Finance", color: "#f59e0b" },
  ];
  const result: Record<string, string> = {};
  for (const c of categories) {
    const row = await prisma.category.upsert({
      where: { name: c.name },
      update: { color: c.color },
      create: { ...c, isSeed: true },
    });
    result[c.name] = row.id;
  }
  return result;
}

async function ensurePeople() {
  const people = [
    { name: "Omar", notes: "Mentorship client. Based in Toronto." },
    { name: "Sarah", notes: "Client — retainer, monthly check-ins." },
    { name: "Jordan", notes: "Video editor, freelance." },
  ];
  const result: Record<string, string> = {};
  for (const p of people) {
    const row = await prisma.person.upsert({
      where: { name: p.name },
      update: {},
      create: { ...p, isSeed: true },
    });
    result[p.name] = row.id;
  }
  return result;
}

async function main() {
  await ensureAdminUser();

  const seedFlag = await prisma.task.findFirst({ where: { isSeed: true } });
  if (seedFlag) {
    console.log("Seed demo data already present — skipping (admin user still synced above).");
    return;
  }

  const cat = await ensureCategories();
  const person = await ensurePeople();

  let pos = 1000;
  const nextPos = () => (pos += 1000);

  // 1. RED — not started, low effort, pinned Today
  const t1 = await prisma.task.create({
    data: {
      title: "Draft Q4 roadmap outline",
      description: "Rough outline of priorities for the next quarter before the planning call.",
      status: TaskStatus.NOT_STARTED,
      effort: Effort.LOW,
      categoryId: cat["Business"],
      pinnedToday: true,
      position: nextPos(),
      isSeed: true,
      steps: {
        create: [
          { title: "List current initiatives", position: 1000 },
          { title: "Rank by leverage", position: 2000 },
          { title: "Write summary", position: 3000 },
        ],
      },
    },
  });

  // 2. ORANGE — in progress (1 of 3 steps done), medium effort, Now
  const t2 = await prisma.task.create({
    data: {
      title: "Build trading mentorship offer page",
      status: TaskStatus.IN_PROGRESS,
      effort: Effort.MEDIUM,
      categoryId: cat["Trading Offer"],
      dueDate: daysFromNow(2),
      startedAt: daysFromNow(-1),
      position: nextPos(),
      isSeed: true,
      steps: {
        create: [
          { title: "Write offer copy", position: 1000, done: true, doneAt: daysFromNow(-1) },
          { title: "Design pricing section", position: 2000 },
          { title: "Publish page", position: 3000 },
        ],
      },
    },
  });

  // 3. YELLOW — finished internal work, waiting on follow-up
  const t3 = await prisma.task.create({
    data: {
      title: "Send proposal to Omar",
      status: TaskStatus.WAITING,
      effort: Effort.LOW,
      categoryId: cat["Relationships"],
      followUpRequired: true,
      followUpDate: daysFromNow(3),
      followUpPersonId: person["Omar"],
      startedAt: daysFromNow(-4),
      waitingAt: daysFromNow(-1),
      position: nextPos(),
      isSeed: true,
      steps: {
        create: [
          { title: "Finish proposal", position: 1000, done: true, doneAt: daysFromNow(-3) },
          { title: "Review proposal", position: 2000, done: true, doneAt: daysFromNow(-2) },
          { title: "Send to Omar", position: 3000, done: true, doneAt: daysFromNow(-1) },
        ],
      },
      people: { create: [{ personId: person["Omar"] }] },
    },
  });

  // 4. GREEN — fully completed, high effort
  await prisma.task.create({
    data: {
      title: "File quarterly taxes",
      status: TaskStatus.COMPLETED,
      effort: Effort.HIGH,
      categoryId: cat["Finance"],
      startedAt: daysFromNow(-10),
      completedAt: daysFromNow(-6),
      position: nextPos(),
      isSeed: true,
      steps: {
        create: [
          { title: "Gather receipts", position: 1000, done: true, doneAt: daysFromNow(-9) },
          { title: "Reconcile books", position: 2000, done: true, doneAt: daysFromNow(-8) },
          { title: "File with accountant", position: 3000, done: true, doneAt: daysFromNow(-6) },
        ],
      },
    },
  });

  // 5. Blocker example — small task unlocking finished work (Priority 2)
  const t5 = await prisma.task.create({
    data: {
      title: "Send final cut instructions to editor",
      description: "Video is fully edited. Jordan just needs shot-order + thumbnail direction to publish.",
      status: TaskStatus.NOT_STARTED,
      effort: Effort.LOW,
      categoryId: cat["Content"],
      dueDate: daysFromNow(1),
      position: nextPos(),
      isSeed: true,
      aiPriorityScore: 0.92,
      aiPriorityReason:
        "This is a small task, but it unlocks a fully completed video that is otherwise ready to publish.",
      people: { create: [{ personId: person["Jordan"] }] },
    },
  });

  // 6. Overdue task
  const t6 = await prisma.task.create({
    data: {
      title: "Renew business insurance",
      status: TaskStatus.NOT_STARTED,
      effort: Effort.MEDIUM,
      categoryId: cat["Operations"],
      dueDate: daysFromNow(-2),
      position: nextPos(),
      isSeed: true,
    },
  });

  // 7. Dependent / blocked task (depends on t2)
  const t7 = await prisma.task.create({
    data: {
      title: "Launch new mentorship offer",
      status: TaskStatus.NOT_STARTED,
      effort: Effort.HIGH,
      categoryId: cat["Trading Offer"],
      dueDate: daysFromNow(6),
      position: nextPos(),
      isSeed: true,
      steps: {
        create: [
          { title: "Finalize pricing", position: 1000 },
          { title: "Announce to email list", position: 2000 },
          { title: "Open enrollment", position: 3000 },
        ],
      },
    },
  });
  await prisma.taskDependency.create({
    data: { blockerId: t2.id, blockedId: t7.id },
  });

  // 8. High effort, Next bucket
  await prisma.task.create({
    data: {
      title: "Prepare investor update deck",
      status: TaskStatus.NOT_STARTED,
      effort: Effort.HIGH,
      categoryId: cat["Business"],
      dueDate: daysFromNow(5),
      position: nextPos(),
      isSeed: true,
    },
  });

  // 9. Later bucket, low priority
  await prisma.task.create({
    data: {
      title: "Redesign personal website",
      status: TaskStatus.NOT_STARTED,
      effort: Effort.MEDIUM,
      categoryId: cat["Personal"],
      dueDate: daysFromNow(24),
      position: nextPos(),
      isSeed: true,
    },
  });

  // 10. Client task, Now bucket
  await prisma.task.create({
    data: {
      title: "Send Sarah's monthly report",
      status: TaskStatus.NOT_STARTED,
      effort: Effort.LOW,
      categoryId: cat["Clients"],
      dueDate: daysFromNow(1),
      position: nextPos(),
      isSeed: true,
      people: { create: [{ personId: person["Sarah"] }] },
    },
  });

  // Calendar events
  await prisma.calendarEvent.create({
    data: {
      title: "Mentorship call with Omar",
      date: daysFromNow(1),
      startTime: "14:00",
      endTime: "14:30",
      categoryId: cat["Relationships"],
      personId: person["Omar"],
      taskId: t3.id,
      isSeed: true,
    },
  });
  await prisma.calendarEvent.create({
    data: {
      title: "Sales calls begin",
      date: daysFromNow(4),
      allDay: true,
      categoryId: cat["Business"],
      isSeed: true,
    },
  });
  await prisma.calendarEvent.create({
    data: {
      title: "Insurance renewal deadline",
      date: daysFromNow(-2),
      allDay: true,
      categoryId: cat["Operations"],
      taskId: t6.id,
      isSeed: true,
    },
  });

  // Context items — clearly marked MANUAL until Obsidian/ChatGPT are connected
  const ctx1 = await prisma.contextItem.create({
    data: {
      source: ContextSourceType.MANUAL,
      content: "Launch new mentorship offer this month — need the page live before sales calls start Monday.",
      contentType: ContextType.PROJECT_UPDATE,
      project: "Trading Offer",
      relevance: 0.8,
      confidence: 0.7,
      processed: true,
      timestamp: daysFromNow(-2),
    },
  });
  const ctx2 = await prisma.contextItem.create({
    data: {
      source: ContextSourceType.MANUAL,
      content: "Told Omar I'd send the proposal by Friday.",
      contentType: ContextType.COMMITMENT,
      personId: person["Omar"],
      relatedTaskId: t3.id,
      relevance: 0.9,
      confidence: 0.95,
      processed: true,
      timestamp: daysFromNow(-4),
    },
  });

  // Suggestions (pending — AI recommends, never auto-applies)
  await prisma.suggestion.create({
    data: {
      type: SuggestionType.BLOCKER,
      title: "Small task may unlock finished work",
      body: "\"Send final cut instructions to editor\" looks like the only thing standing between a finished video and publishing it.",
      reason: "Task description mentions the video is fully edited and only needs delivery instructions.",
      confidence: 0.85,
      relatedTaskId: t5.id,
    },
  });
  await prisma.suggestion.create({
    data: {
      type: SuggestionType.OVERDUE,
      title: "Insurance renewal is overdue",
      body: "\"Renew business insurance\" was due 2 days ago and hasn't been started.",
      reason: "Due date has passed and status is still Not Started.",
      confidence: 0.99,
      relatedTaskId: t6.id,
    },
  });
  await prisma.suggestion.create({
    data: {
      type: SuggestionType.CROSS_SOURCE_LINK,
      title: "Offer page may be a dependency for sales calls",
      body: "\"Build trading mentorship offer page\" appears connected to the \"Sales calls begin\" calendar event and your note about launching the offer this month.",
      reason: "Based on context note updated 2 days ago and the calendar event on " + daysFromNow(4).toDateString() + ".",
      confidence: 0.6,
      relatedTaskId: t2.id,
      relatedContextId: ctx1.id,
    },
  });
  await prisma.suggestion.create({
    data: {
      type: SuggestionType.PERSON_FOLLOW_UP,
      title: "Follow up with Omar",
      body: "You sent the proposal but haven't followed up. You told him Friday — that's the commitment behind this task.",
      reason: 'Based on your note: "Told Omar I\'d send the proposal by Friday."',
      confidence: 0.75,
      relatedTaskId: t3.id,
      relatedPersonId: person["Omar"],
      relatedContextId: ctx2.id,
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
