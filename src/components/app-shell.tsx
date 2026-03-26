"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  MapPinned,
  Bell,
  ShieldCheck,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { canViewBoard } from "@/lib/access";

interface AppShellProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/issues", label: "Issue Inbox", icon: ClipboardList },
  { href: "/map", label: "Issue Map", icon: MapPinned },
  {
    href: "/board",
    label: "Assignment Board",
    icon: ShieldCheck,
    visibleFor: canViewBoard,
  },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const sessionUser = useAppStore((s) => s.sessionUser);
  const departments = useAppStore((s) => s.departments);
  const notifications = useAppStore((s) => s.notifications);
  const logout = useAppStore((s) => s.logout);

  const unreadCount = useMemo(
    () =>
      notifications.filter((n) => !n.isRead && n.userId === sessionUser?.id)
        .length,
    [notifications, sessionUser],
  );

  const visibleNavItems = useMemo(
    () =>
      navItems.filter(
        (item) => !item.visibleFor || item.visibleFor(sessionUser),
      ),
    [sessionUser],
  );

  const departmentName = useMemo(() => {
    if (!sessionUser || sessionUser.role !== "department_head") {
      return null;
    }
    return (
      departments.find((d) => d.id === sessionUser.departmentId)?.name ??
      sessionUser.departmentId
    );
  }, [departments, sessionUser]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div className="h-screen overflow-hidden bg-[radial-gradient(circle_at_18%_8%,#d8eceb_0%,#e8eef2_30%,#e6edf1_100%)] text-slate-800">
      <div className="mx-auto flex h-full max-w-screen-2xl">
        <div className="fixed inset-x-0 top-0 z-40 border-b border-slate-300/55 bg-gradient-to-b from-slate-50/95 to-slate-100/85 px-4 py-3 shadow-[0_6px_18px_rgba(2,6,23,0.08)] lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <img
                src="/app_logo.png"
                alt="Nivaran logo"
                className="h-8 w-8 rounded-lg border border-slate-300/45 bg-slate-100/70 object-cover p-1"
              />
              <p className="text-base font-semibold tracking-tight text-slate-900">
                Nivaran
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300/65 bg-white px-2.5 py-2 text-slate-700 shadow-[0_1px_0_rgba(255,255,255,0.85)_inset,0_6px_12px_rgba(2,6,23,0.1)]"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen ? (
          <button
            type="button"
            aria-label="Close mobile menu overlay"
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/35 lg:hidden"
          />
        ) : null}

        <aside
          className={clsx(
            "fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-300/45 bg-gradient-to-b from-slate-100/95 to-slate-200/75 p-5 text-slate-800 shadow-[inset_-1px_0_0_rgba(255,255,255,0.45),0_20px_30px_rgba(2,6,23,0.2)] transition-transform duration-300 ease-in-out lg:hidden",
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="mb-6 rounded-2xl border border-slate-300/35 bg-gradient-to-b from-slate-50/95 to-slate-100/80 p-4 text-slate-900 shadow-[0_1px_0_rgba(255,255,255,0.86)_inset,0_12px_20px_rgba(2,6,23,0.1)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <img
                  src="/app_logo.png"
                  alt="Nivaran logo"
                  className="h-10 w-10 rounded-xl border border-slate-300/45 bg-slate-100/70 object-cover p-1"
                />
                <h1 className="text-xl font-semibold tracking-tight">
                  Nivaran
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300/65 bg-white p-1.5 text-slate-700"
                aria-label="Close menu"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <nav className="space-y-1.5">
            {visibleNavItems.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={`mobile-${item.href}`}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 ease-in-out",
                    active
                      ? "bg-gradient-to-b from-slate-200/85 to-slate-300/65 text-slate-900 ring-1 ring-slate-300/65 shadow-[0_1px_0_rgba(255,255,255,0.72)_inset,0_8px_18px_rgba(2,6,23,0.14)]"
                      : "text-slate-600 hover:bg-slate-100/85 hover:text-slate-900",
                  )}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                  {item.href === "/notifications" && unreadCount > 0 ? (
                    <span className="ml-auto rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {unreadCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 rounded-2xl border border-slate-300/35 bg-gradient-to-b from-slate-50/95 to-slate-100/80 p-4 text-sm shadow-[0_1px_0_rgba(255,255,255,0.82)_inset,0_10px_20px_rgba(2,6,23,0.1)]">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Signed in as
            </p>
            <p className="text-slate-900">
              {sessionUser?.fullName ?? "Unknown"}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {sessionUser?.role.replace("_", " ")}
            </p>
            {departmentName ? (
              <p className="mt-0.5 text-xs text-slate-500">{departmentName}</p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                logout();
                router.push("/login");
              }}
              className="ui-btn-soft mt-3 w-full border-slate-300/90 bg-white"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </aside>

        <aside className="hidden h-full w-72 flex-col overflow-y-auto border-r border-slate-300/45 bg-gradient-to-b from-slate-100/95 to-slate-200/75 p-5 text-slate-800 shadow-[inset_-1px_0_0_rgba(255,255,255,0.45)] lg:flex">
          <div className="mb-6 rounded-2xl border border-slate-300/35 bg-gradient-to-b from-slate-50/95 to-slate-100/80 p-5 text-slate-900 shadow-[0_1px_0_rgba(255,255,255,0.86)_inset,0_14px_26px_rgba(2,6,23,0.12)] transition-all duration-300 ease-in-out">
            <div className="flex items-center gap-3">
              <img
                src="/app_logo.png"
                alt="Nivaran logo"
                className="h-12 w-12 rounded-xl border border-slate-300/45 bg-slate-100/70 object-cover p-1"
              />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Nivaran
                </h1>
              </div>
            </div>
          </div>

          <nav className="space-y-1.5">
            {visibleNavItems.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 ease-in-out",
                    active
                      ? "bg-gradient-to-b from-slate-200/85 to-slate-300/65 text-slate-900 ring-1 ring-slate-300/65 shadow-[0_1px_0_rgba(255,255,255,0.72)_inset,0_8px_18px_rgba(2,6,23,0.14)]"
                      : "text-slate-600 hover:bg-slate-100/85 hover:text-slate-900 hover:translate-x-0.5",
                  )}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                  {item.href === "/notifications" && unreadCount > 0 ? (
                    <span className="ml-auto rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {unreadCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-2xl border border-slate-300/35 bg-gradient-to-b from-slate-50/95 to-slate-100/80 p-4 text-sm shadow-[0_1px_0_rgba(255,255,255,0.82)_inset,0_10px_20px_rgba(2,6,23,0.1)] transition-all duration-300 ease-in-out">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Signed in as
            </p>
            <p className="text-slate-900">
              {sessionUser?.fullName ?? "Unknown"}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {sessionUser?.role.replace("_", " ")}
            </p>
            {departmentName ? (
              <p className="mt-0.5 text-xs text-slate-500">{departmentName}</p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                logout();
                router.push("/login");
              }}
              className="ui-btn-soft mt-3 w-full border-slate-300/90 bg-white"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </aside>

        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          <main className="h-full overflow-y-auto px-4 pt-20 pb-6 sm:px-6 lg:px-8 lg:pt-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
