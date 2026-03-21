"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { canViewBoard, getVisibleIssues } from "@/lib/access";

const columns = [
  "Reported",
  "Acknowledged",
  "In Progress",
  "Resolved",
] as const;

export default function BoardPage() {
  const issues = useAppStore((s) => s.issues);
  const sessionUser = useAppStore((s) => s.sessionUser);
  const visibleIssues = useMemo(
    () => getVisibleIssues(issues, sessionUser),
    [issues, sessionUser],
  );

  const grouped = useMemo(() => {
    return columns.map((status) => ({
      status,
      items: visibleIssues.filter((issue) => issue.status === status),
    }));
  }, [visibleIssues]);

  if (!canViewBoard(sessionUser)) {
    return (
      <div className="ui-card rounded-xl border-dashed p-8 text-center text-slate-600">
        Your role does not have access to the assignment board.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="ui-card p-5">
        <h3 className="ui-page-title">Assignment Board</h3>
        <p className="ui-page-subtitle">
          Kanban view for quick operational handoff and progress tracking.
        </p>
      </header>

      <section className="grid gap-4 xl:grid-cols-4">
        {grouped.map((column) => (
          <article key={column.status} className="ui-card p-4">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              {column.status}
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              {column.items.length} items
            </p>
            <div className="mt-3 space-y-2">
              {column.items.map((issue) => (
                <Link
                  href={`/issues/${issue.id}`}
                  key={issue.id}
                  className="block rounded-xl border border-slate-300/35 bg-gradient-to-b from-slate-50/95 to-slate-100/75 p-3 shadow-[0_1px_0_rgba(255,255,255,0.75)_inset,0_8px_16px_rgba(2,6,23,0.08)] transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:border-slate-300/60 hover:shadow-[0_1px_0_rgba(255,255,255,0.82)_inset,0_12px_20px_rgba(2,6,23,0.14)]"
                >
                  <p className="text-xs font-semibold text-slate-500">
                    {issue.id}
                  </p>
                  <p className="mt-1 font-medium">{issue.title}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {issue.urgency} • {issue.area}
                  </p>
                </Link>
              ))}
              {column.items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300/65 bg-gradient-to-b from-slate-50/85 to-slate-100/70 p-3 text-sm text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                  No issues in this stage.
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
