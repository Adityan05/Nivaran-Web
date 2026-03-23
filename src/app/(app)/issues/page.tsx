"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { useAppStore } from "@/lib/store";
import {
  formatRelative,
  slaClass,
  statusBadgeClass,
  urgencyBadgeClass,
} from "@/lib/ui";
import { getVisibleIssues } from "@/lib/access";

export default function IssuesPage() {
  const issues = useAppStore((s) => s.issues);
  const users = useAppStore((s) => s.users);
  const sessionUser = useAppStore((s) => s.sessionUser);

  const [status, setStatus] = useState("all");
  const [urgency, setUrgency] = useState("all");
  const [search, setSearch] = useState("");
  const visibleIssues = useMemo(
    () => getVisibleIssues(issues, sessionUser),
    [issues, sessionUser],
  );

  const filtered = useMemo(() => {
    return visibleIssues.filter((issue) => {
      const statusPass = status === "all" || issue.status === status;
      const urgencyPass = urgency === "all" || issue.urgency === urgency;
      const searchPass =
        !search.trim() ||
        issue.title.toLowerCase().includes(search.toLowerCase()) ||
        issue.id.toLowerCase().includes(search.toLowerCase()) ||
        issue.locationAddress.toLowerCase().includes(search.toLowerCase());

      return statusPass && urgencyPass && searchPass;
    });
  }, [visibleIssues, status, urgency, search]);

  return (
    <div className="space-y-6">
      <div className="ui-card border-slate-300/45 bg-linear-to-b from-slate-50/95 to-slate-100/80 p-5">
        <h3 className="ui-page-title">Issue Inbox</h3>
        <p className="ui-page-subtitle">
          Visual queue of civic reports. Tap any card to open and act.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, id, or location"
            className="ui-input md:col-span-2"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="ui-select"
          >
            <option value="all">All status</option>
            <option value="Reported">Reported</option>
            <option value="Acknowledged">Acknowledged</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Rejected">Rejected</option>
          </select>
          <select
            value={urgency}
            onChange={(e) => setUrgency(e.target.value)}
            className="ui-select"
          >
            <option value="all">All urgency</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="ui-card rounded-xl border-dashed p-8 text-center text-slate-500">
          No issues found for the selected filters.
        </div>
      ) : (
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((issue) => {
            const assignee = users.find((u) => u.id === issue.assignedToId);
            const assigneeLabel = assignee
              ? `Assigned to ${assignee.fullName}`
              : "Unassigned";
            return (
              <Link
                key={issue.id}
                href={`/issues/${issue.id}`}
                className="group block"
              >
                <article className="overflow-hidden rounded-2xl border border-slate-300/45 bg-white/90 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_10px_24px_rgba(2,6,23,0.08)] transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:border-slate-300/75 hover:shadow-[0_1px_0_rgba(255,255,255,0.88)_inset,0_16px_28px_rgba(2,6,23,0.14)]">
                  <div className="relative h-32 border-b border-slate-200/70">
                    <img
                      src={issue.imageUrl}
                      alt={issue.title}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-14 bg-linear-to-t from-black/40 to-transparent" />
                    <div className="absolute bottom-2 left-3 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(issue.status)}`}
                      >
                        {issue.status}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${urgencyBadgeClass(issue.urgency)}`}
                      >
                        {issue.urgency}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      <span>{issue.id}</span>
                      <span>{formatRelative(issue.createdAt)}</span>
                    </div>

                    <div>
                      <h4 className="line-clamp-2 text-3xl leading-tight font-semibold tracking-tight text-slate-900 transition group-hover:text-slate-800">
                        {issue.title}
                      </h4>
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">
                        {issue.description}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-slate-200/70 pt-3">
                      <span className="rounded-full border border-slate-300/55 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {issue.category}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${slaClass(issue)}`}
                      >
                        Due {formatRelative(issue.dueAt)}
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-300/40 bg-slate-50/80 p-3 text-xs text-slate-700">
                      <p className="inline-flex items-center gap-1.5">
                        <MapPin size={13} />
                        <span className="truncate">
                          {issue.locationAddress}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-slate-200/70 pt-2 text-xs">
                      {assignee ? (
                        <span className="font-semibold text-slate-600">
                          {assigneeLabel}
                        </span>
                      ) : (
                        <span className="rounded-full border border-rose-300/45 bg-rose-100 px-2.5 py-1 font-semibold text-rose-700">
                          Unassigned
                        </span>
                      )}
                      <span className="font-semibold text-slate-500 transition group-hover:text-slate-800">
                        Open case
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}
