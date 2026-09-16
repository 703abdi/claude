import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import MorningBriefSettings from "@/components/settings/MorningBriefSettings";
import ChatGPTUploader from "@/components/settings/ChatGPTUploader";
import ProcessContextButton from "@/components/settings/ProcessContextButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  const user = await prisma.user.findUnique({ where: { id: session!.userId } });
  const syncSources = await prisma.syncSource.findMany();
  const obsidian = syncSources.find((s) => s.type === "OBSIDIAN");
  const chatgpt = syncSources.find((s) => s.type === "CHATGPT");
  const recentContext = await prisma.contextItem.findMany({
    orderBy: { timestamp: "desc" },
    take: 15,
    include: { person: { select: { name: true } }, relatedTask: { select: { title: true } } },
  });

  const anthropicConfigured = !!process.env.ANTHROPIC_API_KEY;
  const obsidianTokenConfigured = !!process.env.OBSIDIAN_SYNC_TOKEN;
  const chatgptTokenConfigured = !!process.env.CHATGPT_CONNECTOR_TOKEN;
  const ttsConfigured = !!process.env.TTS_PROVIDER;

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted mt-1">Morning brief, context sources, and integrations.</p>
      </div>

      <section className="border border-border bg-surface rounded-lg p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide mb-3">Morning brief</h2>
        <MorningBriefSettings
          initial={{
            morningBriefTime: user!.morningBriefTime,
            timezone: user!.timezone,
            voiceStyle: user!.voiceStyle,
          }}
          ttsConfigured={ttsConfigured}
        />
      </section>

      <section className="border border-border bg-surface rounded-lg p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold uppercase tracking-wide">Obsidian sync</h2>
          <StatusBadge configured={obsidianTokenConfigured} lastSyncAt={obsidian?.lastSyncAt ?? null} />
        </div>
        <p className="text-xs text-muted mt-2 mb-2">
          Run the local sync agent in <code>sync-agent/</code> against this vault. It watches your notes and pushes
          changes here incrementally — nothing runs on the server to read your filesystem.
        </p>
        {!obsidianTokenConfigured && (
          <p className="text-xs text-status-orange">
            Set OBSIDIAN_SYNC_TOKEN in this app&apos;s environment variables, then the same value in{" "}
            <code>sync-agent/.env</code>, to enable syncing.
          </p>
        )}
      </section>

      <section className="border border-border bg-surface rounded-lg p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold uppercase tracking-wide">ChatGPT context</h2>
          <StatusBadge configured lastSyncAt={chatgpt?.lastSyncAt ?? null} />
        </div>
        <div className="mt-2">
          <ChatGPTUploader />
        </div>
        {!chatgptTokenConfigured && (
          <p className="text-xs text-muted-2 mt-2">
            (Optional) Set CHATGPT_CONNECTOR_TOKEN to also enable the automated bearer-token ingestion endpoint for
            future tooling — the manual upload above works without it.
          </p>
        )}
      </section>

      <section className="border border-border bg-surface rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wide">Context feed</h2>
          <ProcessContextButton />
        </div>
        <p className="text-xs text-muted-2 mb-3">
          {anthropicConfigured
            ? "Commitment/blocker extraction is active (ANTHROPIC_API_KEY configured)."
            : "No ANTHROPIC_API_KEY configured — context is stored but not yet analyzed for commitments or suggestions."}
        </p>
        {recentContext.length === 0 ? (
          <p className="text-sm text-muted-2">Nothing ingested yet.</p>
        ) : (
          <div className="space-y-2">
            {recentContext.map((c) => (
              <div key={c.id} className="border border-border rounded-md px-3 py-2">
                <p className="text-sm line-clamp-2">{c.content}</p>
                <p className="text-xs text-muted-2 mt-1">
                  {c.source.toLowerCase()} · {c.contentType.toLowerCase().replace("_", " ")} ·{" "}
                  {new Date(c.timestamp).toLocaleDateString()}
                  {c.person ? ` · ${c.person.name}` : ""}
                  {c.relatedTask ? ` · linked to "${c.relatedTask.title}"` : ""}
                  {!c.processed ? " · pending analysis" : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ configured, lastSyncAt }: { configured: boolean; lastSyncAt: Date | null }) {
  if (!configured) {
    return <span className="text-[11px] text-muted-2 px-2 py-0.5 rounded-full border border-border">Not configured</span>;
  }
  if (!lastSyncAt) {
    return <span className="text-[11px] text-muted-2 px-2 py-0.5 rounded-full border border-border">Never synced</span>;
  }
  return (
    <span className="text-[11px] text-status-green px-2 py-0.5 rounded-full border border-status-green/40">
      Synced {new Date(lastSyncAt).toLocaleString()}
    </span>
  );
}
