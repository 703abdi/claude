"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import Avatar from "@/components/shared/Avatar";

// Everything lives on the Hub. Calendar and People are Hub sections; Tasks is the one deep page.
const NAV_ITEMS = [
  { href: "/hub", label: "Hub", icon: HubIcon, match: "/hub" },
  { href: "/tasks", label: "Tasks", icon: TasksIcon, match: "/tasks" },
  { href: "/hub#calendar", label: "Calendar", icon: CalendarIcon, match: "/calendar" },
  { href: "/hub#people", label: "People", icon: PeopleIcon, match: "/people" },
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
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !mobileMenuRef.current?.contains(t)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function addSomething() {
    if (pathname.startsWith("/hub")) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => window.dispatchEvent(new Event("pos:focus-command")), 450);
    } else {
      router.push("/hub?add=1");
    }
  }

  function openSearch() {
    window.dispatchEvent(new CustomEvent("open-command-palette"));
  }

  const displayName = displayNameForEmail(email);

  const accountMenu = (
    <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl border border-border-2 bg-surface-hover shadow-xl py-1.5 animate-fade-in z-50">
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
  );

  return (
    <div className="flex flex-col min-h-screen">
      {/* Desktop top bar */}
      <header className="hidden md:flex items-center justify-between gap-4 border-b border-border px-6 py-2.5 sticky top-0 bg-background/80 backdrop-blur-xl z-40">
        <div className="flex items-center gap-6 shrink-0">
          <Link href="/hub" className="flex items-center gap-2">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.match);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                    active ? "nav-active" : "text-muted hover:text-foreground hover:bg-surface-hover"
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
          aria-label="Search"
          className="min-w-0 xl:flex-1 max-w-sm flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border-2 text-muted hover:border-accent hover:text-foreground transition-colors"
        >
          <SearchIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden xl:inline text-sm whitespace-nowrap truncate">Search or jump to</span>
          <span className="hidden xl:inline ml-auto text-[11px] font-mono text-muted-2 shrink-0">⌘K</span>
        </button>

        <div className="relative shrink-0" ref={menuRef}>
          <button onClick={() => setMenuOpen((v) => !v)} aria-label="Account menu" aria-expanded={menuOpen}>
            <Avatar name={displayName} size="sm" />
          </button>
          {menuOpen && accountMenu}
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between border-b border-border px-4 py-3 sticky top-0 bg-background/80 backdrop-blur-xl z-40">
        <Link href="/hub" className="flex items-center gap-2">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-3">
          <button onClick={openSearch} className="text-muted hover:text-foreground transition-colors" aria-label="Search">
            <SearchIcon className="w-4 h-4" />
          </button>
          <div className="relative" ref={mobileMenuRef}>
            <button onClick={() => setMenuOpen((v) => !v)} aria-label="Account menu" aria-expanded={menuOpen} className="flex">
              <Avatar name={displayName} size="sm" />
            </button>
            {menuOpen && accountMenu}
          </div>
        </div>
      </header>

      <main className="flex-1 pb-20 md:pb-0">{children}</main>

      {/* Mobile bottom nav: Hub, +, Tasks */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-border bg-background/90 backdrop-blur-xl z-40 flex items-stretch pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map((item, i) => {
          const active = pathname.startsWith(item.match);
          const link = (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
                active ? "text-accent" : "text-muted-2"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
          if (i !== 0) return link;
          return (
            <Fragment key="hub-and-add">
              {link}
              <button
                onClick={addSomething}
                aria-label="Add something"
                className="flex flex-1 flex-col items-center justify-center py-2"
              >
                <span className="btn-primary h-11 w-11 rounded-full p-0 text-2xl leading-none">+</span>
              </button>
            </Fragment>
          );
        })}
      </nav>
    </div>
  );
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-accent text-[13px] font-extrabold text-accent-ink">a</span>
      <span className="text-[15px] font-extrabold tracking-[-0.03em]">abdi&apos;s os</span>
    </span>
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
function HubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
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

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
