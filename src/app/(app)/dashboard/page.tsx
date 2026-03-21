"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import KpiCard from "@/components/kpi-card";
import { useAppStore } from "@/lib/store";
import { slaTone } from "@/lib/ui";
import { getVisibleIssues } from "@/lib/access";

export default function DashboardPage() {
  const issues = useAppStore((s) => s.issues);
  const sessionUser = useAppStore((s) => s.sessionUser);
  const visibleIssues = useMemo(
    () => getVisibleIssues(issues, sessionUser),
    [issues, sessionUser],
  );

  const stats = useMemo(() => {
    const openIssues = visibleIssues.filter(
      (i) => !["Resolved", "Rejected"].includes(i.status),
    );
    const highPriority = openIssues.filter((i) => i.urgency === "High");
    const breached = openIssues.filter((i) => slaTone(i) === "danger");
    const inProgress = visibleIssues.filter((i) => i.status === "In Progress");

    return {
      total: visibleIssues.length,
      open: openIssues.length,
      highPriority: highPriority.length,
      breached: breached.length,
      inProgress: inProgress.length,
    };
  }, [visibleIssues]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const issue of visibleIssues) {
      map.set(issue.status, (map.get(issue.status) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [visibleIssues]);

  const byDepartment = useMemo(() => {
    const map = new Map<string, number>();
    for (const issue of visibleIssues) {
      map.set(
        issue.assignedDepartmentId,
        (map.get(issue.assignedDepartmentId) ?? 0) + 1,
      );
    }
    return Array.from(map.entries()).map(([department, count]) => ({
      department,
      count,
    }));
  }, [visibleIssues]);

  const pieColors = ["#0f172a", "#334155", "#0369a1", "#1d4ed8", "#475569"];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total Issues" value={stats.total} />
        <KpiCard label="Open" value={stats.open} tone="warn" />
        <KpiCard
          label="High Priority"
          value={stats.highPriority}
          tone="danger"
        />
        <KpiCard label="SLA Breached" value={stats.breached} tone="danger" />
        <KpiCard label="In Progress" value={stats.inProgress} tone="good" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="ui-card p-5">
          <h3 className="text-lg font-semibold tracking-tight">
            Status Distribution
          </h3>
          <p className="ui-page-subtitle">
            Operational split across all active and closed cases.
          </p>
          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  <filter
                    id="pieShadow"
                    x="-20%"
                    y="-20%"
                    width="140%"
                    height="140%"
                  >
                    <feDropShadow
                      dx="0"
                      dy="6"
                      stdDeviation="6"
                      floodColor="#0f172a"
                      floodOpacity="0.18"
                    />
                  </filter>
                </defs>
                <Pie
                  data={byStatus}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={102}
                  paddingAngle={3}
                  stroke="rgba(255,255,255,0.65)"
                  strokeWidth={1.4}
                  filter="url(#pieShadow)"
                >
                  {byStatus.map((entry, index) => (
                    <Cell
                      key={`${entry.name}-${index}`}
                      fill={pieColors[index % pieColors.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.35)",
                    backgroundColor: "rgba(255,255,255,0.9)",
                    boxShadow: "0 12px 22px rgba(15,23,42,0.12)",
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  align="center"
                  iconType="circle"
                  iconSize={9}
                  wrapperStyle={{
                    fontSize: 12,
                    color: "#334155",
                    paddingTop: 8,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="ui-card p-5">
          <h3 className="text-lg font-semibold tracking-tight">
            Department Load
          </h3>
          <p className="ui-page-subtitle">
            Issue count currently routed to each department.
          </p>
          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDepartment}>
                <defs>
                  <linearGradient id="barSurface" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.95} />
                    <stop
                      offset="100%"
                      stopColor="#1e3a8a"
                      stopOpacity={0.95}
                    />
                  </linearGradient>
                  <filter
                    id="barShadow"
                    x="-20%"
                    y="-10%"
                    width="140%"
                    height="140%"
                  >
                    <feDropShadow
                      dx="0"
                      dy="5"
                      stdDeviation="4"
                      floodColor="#0f172a"
                      floodOpacity="0.2"
                    />
                  </filter>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148,163,184,0.25)"
                />
                <XAxis dataKey="department" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.35)",
                    backgroundColor: "rgba(255,255,255,0.9)",
                    boxShadow: "0 12px 22px rgba(15,23,42,0.12)",
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="url(#barSurface)"
                  radius={[10, 10, 3, 3]}
                  filter="url(#barShadow)"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>
    </div>
  );
}
