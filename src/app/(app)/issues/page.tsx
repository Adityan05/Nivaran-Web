"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  MapPin,
  MessageCircle,
  ThumbsUp,
  Users,
} from "lucide-react";
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
      <div className="ui-card border-slate-300/45 bg-gradient-to-b from-slate-50/95 to-slate-100/80 p-5">
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
              ? assignee.id === sessionUser?.id
                ? "Assigned to you"
                : assignee.fullName
              : "Unassigned";
            return (
              <Link
                key={issue.id}
                href={`/issues/${issue.id}`}
                className="group block"
              >
                <article className="overflow-hidden rounded-[1.4rem] border border-slate-300/35 bg-gradient-to-b from-slate-50/95 to-slate-100/80 shadow-[0_1px_0_rgba(255,255,255,0.82)_inset,0_10px_24px_rgba(2,6,23,0.11)] transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:border-slate-300/65 hover:shadow-[0_1px_0_rgba(255,255,255,0.88)_inset,0_16px_30px_rgba(2,6,23,0.16)]">
                  <div className="relative border-b border-slate-200/50">
                    <img
                      src={issue.imageUrl}
                      alt={issue.title}
                      className="h-52 w-full object-cover saturate-[0.95]"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-black/45 to-transparent" />
                    <div className="absolute right-3 top-3 rounded-full border border-white/55 bg-gradient-to-b from-white to-slate-100/90 p-1.5 text-slate-700 opacity-0 shadow-[0_10px_20px_rgba(2,6,23,0.2)] transition-all duration-300 ease-in-out group-hover:opacity-100">
                      <ArrowUpRight size={14} />
                    </div>
                    <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
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
                    <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      <span>{issue.id}</span>
                      <span>{formatRelative(issue.createdAt)}</span>
                    </div>

                    <div>
                      <h4 className="line-clamp-2 text-[1.45rem] leading-tight font-semibold tracking-tight text-slate-900 transition group-hover:text-cyan-800">
                        {issue.title}
                      </h4>
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">
                        {issue.description}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-slate-200/60 pt-3">
                      <span className="rounded-full border border-slate-300/45 bg-gradient-to-b from-slate-100/95 to-slate-200/70 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                        {issue.category}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${slaClass(issue)}`}
                      >
                        Due {formatRelative(issue.dueAt)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-300/35 bg-gradient-to-b from-slate-50/95 to-slate-100/75 p-3 text-xs text-slate-700 shadow-[0_1px_0_rgba(255,255,255,0.82)_inset,0_8px_16px_rgba(2,6,23,0.08)]">
                      <p className="inline-flex items-center gap-1.5">
                        <MapPin size={13} />
                        <span className="truncate">
                          {issue.locationAddress}
                        </span>
                      </p>
                      <p className="inline-flex items-center gap-1.5">
                        <Users size={13} />
                        Affected {issue.affectedUsersCount}
                      </p>
                      <p className="inline-flex items-center gap-1.5">
                        <ThumbsUp size={13} />
                        {issue.upvotes ?? 0} upvotes
                      </p>
                      <p className="inline-flex items-center gap-1.5">
                        <MessageCircle size={13} />
                        {issue.commentsCount ?? 0} updates
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-slate-200/60 pt-2 text-xs text-slate-500">
                      <span>{assigneeLabel}</span>
                      <span className="rounded-full border border-slate-300/45 bg-gradient-to-b from-slate-100/95 to-slate-200/70 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        Tap to open
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
