"use client";

import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { canViewTeam, getVisibleIssues, getVisibleUsers } from "@/lib/access";

export default function TeamPage() {
  const users = useAppStore((s) => s.users);
  const issues = useAppStore((s) => s.issues);
  const sessionUser = useAppStore((s) => s.sessionUser);
  const visibleUsers = useMemo(
    () => getVisibleUsers(users, sessionUser),
    [users, sessionUser],
  );
  const visibleIssues = useMemo(
    () => getVisibleIssues(issues, sessionUser),
    [issues, sessionUser],
  );

  const rows = useMemo(() => {
    return visibleUsers.map((user) => {
      const assigned = visibleIssues.filter(
        (i) =>
          i.assignedToId === user.id &&
          !["Resolved", "Rejected"].includes(i.status),
      );
      const highPriority = assigned.filter((i) => i.urgency === "High").length;

      return {
        ...user,
        activeAssigned: assigned.length,
        highPriority,
      };
    });
  }, [visibleUsers, visibleIssues]);

  if (!canViewTeam(sessionUser)) {
    return (
      <div className="ui-card rounded-xl border-dashed p-8 text-center text-slate-600">
        Your role does not have access to team workload data.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="ui-card p-5">
        <h3 className="ui-page-title">Team Workload</h3>
        <p className="ui-page-subtitle">
          Quick balancing view for heads and operators.
        </p>
      </header>

      <div className="ui-table-wrap">
        <table className="min-w-full text-sm">
          <thead className="ui-table-head">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Area</th>
              <th className="px-4 py-3">Open Assigned</th>
              <th className="px-4 py-3">High Priority</th>
              <th className="px-4 py-3">Load Signal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const loadSignal =
                row.activeAssigned > 8
                  ? "Heavy"
                  : row.activeAssigned > 4
                    ? "Medium"
                    : "Light";
              return (
                <tr
                  key={row.id}
                  className="border-t border-slate-200/50 transition-all duration-300 ease-in-out hover:bg-gradient-to-r hover:from-slate-100/70 hover:to-slate-50/40"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold">{row.fullName}</p>
                    <p className="text-xs text-slate-500">{row.email}</p>
                  </td>
                  <td className="px-4 py-3">{row.role.replace("_", " ")}</td>
                  <td className="px-4 py-3">{row.area}</td>
                  <td className="px-4 py-3">{row.activeAssigned}</td>
                  <td className="px-4 py-3">{row.highPriority}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        loadSignal === "Heavy"
                          ? "border border-rose-300/35 bg-gradient-to-b from-rose-50/90 to-rose-100/70 text-rose-800"
                          : loadSignal === "Medium"
                            ? "border border-amber-300/35 bg-gradient-to-b from-amber-50/90 to-amber-100/70 text-amber-800"
                            : "border border-emerald-300/35 bg-gradient-to-b from-emerald-50/90 to-emerald-100/70 text-emerald-800"
                      }`}
                    >
                      {loadSignal}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
