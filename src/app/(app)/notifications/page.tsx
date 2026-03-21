"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { formatRelative } from "@/lib/ui";

export default function NotificationsPage() {
  const sessionUser = useAppStore((s) => s.sessionUser);
  const notifications = useAppStore((s) => s.notifications);
  const markNotificationRead = useAppStore((s) => s.markNotificationRead);

  const inbox = useMemo(() => {
    if (!sessionUser) return [];
    return notifications
      .filter((n) => n.userId === sessionUser.id)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [sessionUser, notifications]);

  return (
    <div className="space-y-5">
      <header className="ui-card p-5">
        <h3 className="ui-page-title">Notifications</h3>
        <p className="ui-page-subtitle">
          Assignment and status alerts for the signed-in operator.
        </p>
      </header>

      <section className="space-y-2">
        {inbox.map((item) => (
          <article
            key={item.id}
            className={`rounded-2xl border p-4 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_8px_18px_rgba(2,6,23,0.1)] transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:shadow-[0_1px_0_rgba(255,255,255,0.86)_inset,0_14px_24px_rgba(2,6,23,0.16)] ${item.isRead ? "border-slate-300/35 bg-gradient-to-b from-slate-50/95 to-slate-100/80" : "border-sky-300/35 bg-gradient-to-b from-sky-50/90 to-blue-100/70"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-semibold">{item.title}</h4>
                <p className="mt-1 text-sm text-slate-700">{item.body}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatRelative(item.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {item.issueId ? (
                  <Link
                    href={`/issues/${item.issueId}`}
                    className="text-sm font-semibold text-slate-700 underline-offset-2 transition-all duration-300 ease-in-out hover:text-slate-900 hover:underline"
                  >
                    Open issue
                  </Link>
                ) : null}
                {!item.isRead ? (
                  <button
                    type="button"
                    onClick={() => markNotificationRead(item.id)}
                    className="ui-btn-soft px-2.5 py-1 text-xs"
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}

        {inbox.length === 0 ? (
          <div className="ui-card rounded-xl border-dashed p-8 text-center text-slate-500">
            No alerts for this account.
          </div>
        ) : null}
      </section>
    </div>
  );
}
