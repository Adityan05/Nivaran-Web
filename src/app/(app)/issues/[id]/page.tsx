"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import {
  formatRelative,
  slaClass,
  statusBadgeClass,
  urgencyBadgeClass,
} from "@/lib/ui";
import {
  canAccessIssue,
  canAssignIssue,
  canAssignToUser,
  canRerouteIssue,
  getAllowedStatusTransitions,
} from "@/lib/access";
import { IssueStatus } from "@/lib/types";

export default function IssueDetailsPage() {
  const params = useParams<{ id: string }>();
  const issueId = params.id;

  const sessionUser = useAppStore((s) => s.sessionUser);
  const issues = useAppStore((s) => s.issues);
  const users = useAppStore((s) => s.users);
  const departments = useAppStore((s) => s.departments);
  const events = useAppStore((s) => s.events);
  const assignIssue = useAppStore((s) => s.assignIssue);
  const rerouteIssue = useAppStore((s) => s.rerouteIssue);
  const updateIssueStatus = useAppStore((s) => s.updateIssueStatus);

  const [selectedAssignee, setSelectedAssignee] = useState("");
  const [targetDepartmentId, setTargetDepartmentId] = useState("");
  const [rerouteNote, setRerouteNote] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<IssueStatus | null>(
    null,
  );
  const [note, setNote] = useState("");

  const issue = issues.find((i) => i.id === issueId);

  const issueEvents = useMemo(
    () =>
      events
        .filter((e) => e.issueId === issueId)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [events, issueId],
  );

  if (!issue) {
    notFound();
  }

  if (!canAccessIssue(sessionUser, issue)) {
    return (
      <div className="ui-card p-6">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Issue access updated
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          This issue was rerouted or reassigned and is no longer in your current
          department scope.
        </p>
        <Link href="/issues" className="ui-btn-soft mt-4">
          Back to issues
        </Link>
      </div>
    );
  }

  const canAssign = canAssignIssue(sessionUser, issue);
  const canReroute = canRerouteIssue(sessionUser, issue);
  const allowedStatuses = getAllowedStatusTransitions(sessionUser, issue);
  const canUpdateStatus = allowedStatuses.length > 0;

  useEffect(() => {
    if (!allowedStatuses.length) {
      setSelectedStatus(null);
      return;
    }

    if (!selectedStatus || !allowedStatuses.includes(selectedStatus)) {
      setSelectedStatus(allowedStatuses[0]);
    }
  }, [allowedStatuses, selectedStatus]);

  const assignees = users.filter((u) => canAssignToUser(sessionUser, u, issue));
  const rerouteOptions = departments.filter(
    (d) => d.id !== issue.assignedDepartmentId,
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
      <section className="space-y-5">
        <article className="ui-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                {issue.id}
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                {issue.title}
              </h2>
              <p className="mt-2 leading-relaxed text-slate-600">
                {issue.description}
              </p>
            </div>
            <img
              src={issue.imageUrl}
              alt={issue.title}
              className="h-24 w-32 rounded-xl border border-slate-300/40 object-cover shadow-[0_8px_16px_rgba(2,6,23,0.14)]"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
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
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${slaClass(issue)}`}
            >
              Due {formatRelative(issue.dueAt)}
            </span>
            <span className="rounded-full border border-slate-300/45 bg-gradient-to-b from-slate-100/95 to-slate-200/70 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {issue.category}
            </span>
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <p>
              <span className="font-semibold">Reporter:</span>{" "}
              {issue.reporterName}
            </p>
            <p>
              <span className="font-semibold">Area:</span>{" "}
              {issue.locationAddress}
            </p>
            <p>
              <span className="font-semibold">Affected users:</span>{" "}
              {issue.affectedUsersCount}
            </p>
            <p>
              <span className="font-semibold">Created:</span>{" "}
              {formatRelative(issue.createdAt)}
            </p>
          </div>
        </article>

        <article className="ui-card p-5">
          <h3 className="text-lg font-semibold tracking-tight">
            Status Timeline
          </h3>
          <div className="mt-3 space-y-3">
            {issueEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-xl border border-slate-300/35 bg-gradient-to-b from-slate-50/95 to-slate-100/75 p-3 shadow-[0_1px_0_rgba(255,255,255,0.82)_inset,0_8px_16px_rgba(2,6,23,0.08)] transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:shadow-[0_1px_0_rgba(255,255,255,0.88)_inset,0_12px_20px_rgba(2,6,23,0.13)]"
              >
                <p className="font-medium">{event.title}</p>
                {event.note ? (
                  <p className="mt-1 text-sm text-slate-600">{event.note}</p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">
                  {event.actorName} • {formatRelative(event.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="space-y-5">
        <article className="ui-card p-5">
          <h3 className="text-lg font-semibold tracking-tight">Assignment</h3>
          <p className="mt-1 text-sm text-slate-600">
            Assign this issue to an accountable team member.
          </p>
          {canAssign ? (
            <>
              <select
                className="ui-select mt-3"
                value={selectedAssignee}
                onChange={(e) => setSelectedAssignee(e.target.value)}
              >
                <option value="">Select assignee</option>
                {assignees.map((user) => (
                  <option value={user.id} key={user.id}>
                    {user.fullName} ({user.role.replace("_", " ")})
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="ui-btn-accent mt-3 w-full"
                onClick={() => {
                  if (!sessionUser || !selectedAssignee) return;
                  assignIssue(issue.id, selectedAssignee, sessionUser.id);
                  setSelectedAssignee("");
                }}
                disabled={!selectedAssignee}
              >
                Confirm Assignment
              </button>
            </>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300/70 bg-gradient-to-b from-slate-50/85 to-slate-100/70 p-3 text-sm text-slate-500">
              Your role can view this issue but cannot reassign it.
            </p>
          )}
        </article>

        {canReroute ? (
          <article className="ui-card p-5">
            <h3 className="text-lg font-semibold tracking-tight">Re-route</h3>
            <p className="mt-1 text-sm text-slate-600">
              Transfer this issue to another department for reassignment.
            </p>

            <select
              className="ui-select mt-3"
              value={targetDepartmentId}
              onChange={(e) => setTargetDepartmentId(e.target.value)}
            >
              <option value="">Select target department</option>
              {rerouteOptions.map((department) => (
                <option value={department.id} key={department.id}>
                  {department.name}
                </option>
              ))}
            </select>

            <textarea
              value={rerouteNote}
              onChange={(e) => setRerouteNote(e.target.value)}
              rows={3}
              placeholder="Reason for reroute (recommended)"
              className="ui-textarea mt-2"
            />

            <button
              type="button"
              className="ui-btn-soft mt-3 w-full"
              onClick={() => {
                if (!sessionUser || !targetDepartmentId) return;
                rerouteIssue(
                  issue.id,
                  targetDepartmentId,
                  sessionUser.id,
                  rerouteNote.trim(),
                );
                setTargetDepartmentId("");
                setRerouteNote("");
              }}
              disabled={!targetDepartmentId}
            >
              Confirm Re-route
            </button>
          </article>
        ) : null}

        <article className="ui-card p-5">
          <h3 className="text-lg font-semibold tracking-tight">
            Status Update
          </h3>
          {canUpdateStatus ? (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Choose next status
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {allowedStatuses.map((status) => {
                  const isActive = selectedStatus === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setSelectedStatus(status)}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-all duration-300 ease-in-out ${
                        isActive
                          ? "border-slate-400/55 bg-gradient-to-b from-slate-100/95 to-slate-200/75 text-slate-800 shadow-[0_1px_0_rgba(255,255,255,0.75)_inset,0_8px_14px_rgba(2,6,23,0.12)]"
                          : "border-slate-300/55 bg-gradient-to-b from-slate-50/95 to-slate-100/75 text-slate-700 hover:-translate-y-0.5 hover:shadow-[0_1px_0_rgba(255,255,255,0.82)_inset,0_10px_16px_rgba(2,6,23,0.1)]"
                      }`}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="Optional update note"
                className="ui-textarea mt-2"
              />
              <button
                type="button"
                className="ui-btn-primary mt-3 w-full"
                onClick={() => {
                  if (!sessionUser || !selectedStatus) return;
                  updateIssueStatus(
                    issue.id,
                    selectedStatus,
                    sessionUser.id,
                    note.trim(),
                  );
                  setNote("");
                }}
                disabled={!selectedStatus}
              >
                {selectedStatus
                  ? `Update to ${selectedStatus}`
                  : "Update Status"}
              </button>
            </>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300/70 bg-gradient-to-b from-slate-50/85 to-slate-100/70 p-3 text-sm text-slate-500">
              Your role does not have permission to change issue status.
            </p>
          )}
        </article>
      </section>
    </div>
  );
}
