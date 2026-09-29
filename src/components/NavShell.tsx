"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import Avatar from "@/components/shared/Avatar";

const NAV_ITEMS = [
  { href: "/tasks", label: "Tasks", icon: TasksIcon },
  { href: "/people", label: "People", icon: PeopleIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarIcon },
];

function displayNameForEmail(email: string) {
  const local = email.split("@")[0] ?? email;
  const letters = local.replace(/^[0-9._-]+/, "") || local;
  return letters;
}

export default function NavShell({
  children,
  email,
}: {
  children: ReactNode;
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function openSearch() {
    window.dispatchEvent(new CustomEvent("open-command-palette"));
  }

  const displayName = displayNameForEmail(email);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Desktop top bar */}
      <header className="hidden md:flex items-center justify-between gap-4 border-b border-border px-6 py-2.5 sticky top-0 bg-background z-40">
        <div className="flex items-center gap-6 shrink-0">
          <Link href="/tasks" className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-white text-xs font-bold shrink-0">
              a
            </span>
            <span className="font-bold text-sm tracking-tight">abdi&apos;s os</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    active ? "bg-accent text-white" : "text-muted hover:text-foreground"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <button
          onClick={openSearch}
          className="flex-1 max-w-sm flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-surface text-muted hover:border-muted-2 transition-colors"
        >
          <SearchIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="text-sm">Search or jump to</span>
          <span className="ml-auto text-[11px] font-mono text-muted-2 shrink-0">⌘K</span>
        </button>

        <div className="relative shrink-0" ref={menuRef}>
          <button onClick={() => setMenuOpen((v) => !v)}>
            <Avatar name={displayName} size="sm" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-border bg-surface shadow-xl py-1.5 animate-fade-in z-50">
              <p className="px-3 py-1.5 text-xs text-muted-2 truncate border-b border-border mb-1">{email}</p>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted hover:text-foreground hover:bg-surface-hover"
              >
                <GearIcon className="w-3.5 h-3.5" />
                Settings
              </Link>
              <button
                onClick={logout}
                className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-muted hover:text-foreground hover:bg-surface-hover"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between border-b border-border px-4 py-3 sticky top-0 bg-background z-40">
        <span className="font-bold text-sm tracking-tight">abdi&apos;s os</span>
        <div className="flex items-center gap-3">
          <button onClick={openSearch} className="text-muted hover:text-foreground transition-colors" aria-label="Search">
            <SearchIcon className="w-4 h-4" />
          </button>
          <Link href="/settings" className="text-muted hover:text-foreground transition-colors" aria-label="Settings">
            <GearIcon className="w-4 h-4" />
          </Link>
          <button onClick={logout} className="text-xs text-muted">
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 pb-20 md:pb-0">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-border bg-background z-40 flex items-stretch pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-accent" : "text-muted-2"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function TasksIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M9 11l3 3L22 4M4 12l3 3 6-6M4 20l3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function PeopleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
