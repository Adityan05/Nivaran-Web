"use client";

import { useEffect, useMemo } from "react";
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
import { AlertTriangle, CloudRain } from "lucide-react";
import KpiCard from "@/components/kpi-card";
import { useAppStore } from "@/lib/store";
import { slaTone } from "@/lib/ui";
import { getVisibleIssues } from "@/lib/access";

export default function DashboardPage() {
  const issues = useAppStore((s) => s.issues);
  const sessionUser = useAppStore((s) => s.sessionUser);
  const floodRiskAlerts = useAppStore((s) => s.floodRiskAlerts);
  const floodRiskSummary = useAppStore((s) => s.floodRiskSummary);
  const floodRiskLoading = useAppStore((s) => s.floodRiskLoading);
  const floodRiskAutomationNote = useAppStore((s) => s.floodRiskAutomationNote);
  const refreshFloodRiskAlerts = useAppStore((s) => s.refreshFloodRiskAlerts);
  const liveOpsStatusSummary = useAppStore((s) => s.liveOpsStatusSummary);
  const liveOpsStatusLoading = useAppStore((s) => s.liveOpsStatusLoading);
  const refreshLiveOpsStatus = useAppStore((s) => s.refreshLiveOpsStatus);
  const isCommissioner = sessionUser?.role === "commissioner";
  const visibleIssues = useMemo(
    () => getVisibleIssues(issues, sessionUser),
    [issues, sessionUser],
  );

  useEffect(() => {
    if (!isCommissioner) {
      return;
    }
    void refreshFloodRiskAlerts(issues);
    void refreshLiveOpsStatus(issues);
  }, [isCommissioner, issues, refreshFloodRiskAlerts, refreshLiveOpsStatus]);

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

  const sortedFloodRiskAlerts = useMemo(() => {
    const riskWeight: Record<string, number> = {
      Critical: 4,
      High: 3,
      Moderate: 2,
      Low: 1,
    };

    return [...floodRiskAlerts].sort((a, b) => {
      const byRisk =
        (riskWeight[b.riskLevel] ?? 0) - (riskWeight[a.riskLevel] ?? 0);
      if (byRisk !== 0) {
        return byRisk;
      }
      return b.expectedRainMm - a.expectedRainMm;
    });
  }, [floodRiskAlerts]);

  const visibleFloodRiskAlerts = sortedFloodRiskAlerts.slice(0, 4);
  const hiddenFloodRiskAlerts = Math.max(
    0,
    sortedFloodRiskAlerts.length - visibleFloodRiskAlerts.length,
  );

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

      {isCommissioner ? (
        <section className="ui-card border-sky-300/45 bg-gradient-to-b from-sky-50/90 to-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-900">
                Live Operations Status
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                AI summary is reused across refreshes and regenerates only when
                issue count or issue statuses change.
              </p>
            </div>
            {liveOpsStatusLoading ? (
              <span className="rounded-full border border-sky-300/60 bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
                Updating...
              </span>
            ) : null}
          </div>

          <p className="mt-3 rounded-xl border border-sky-200/65 bg-white/80 p-3 text-sm font-medium text-slate-700">
            {liveOpsStatusSummary ??
              "Generating your current operations summary..."}
          </p>
        </section>
      ) : null}

      {isCommissioner ? (
        <section className="ui-card border-amber-300/50 bg-gradient-to-b from-amber-50/95 to-rose-50/65 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
                <AlertTriangle size={18} className="text-amber-600" />
                Rainfall Flood-Risk Warning
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Forecast-driven, pattern-based alerts for potential water
                logging zones in the next few days.
              </p>
            </div>
            {floodRiskLoading ? (
              <span className="rounded-full border border-amber-300/70 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                Refreshing...
              </span>
            ) : null}
          </div>

          {floodRiskSummary ? (
            <p className="mt-3 rounded-xl border border-amber-300/45 bg-white/70 p-3 text-sm font-medium text-slate-700">
              {floodRiskSummary}
            </p>
          ) : null}

          {sortedFloodRiskAlerts.length > 0 ? (
            <div className="mt-3 space-y-2.5">
              {visibleFloodRiskAlerts.map((alert) => (
                <article
                  key={alert.id}
                  className="rounded-xl border border-amber-300/40 bg-white/80 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {alert.riskLevel} risk
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-900">
                        {alert.area}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-300/55 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      Confidence {(alert.confidenceScore * 100).toFixed(0)}%
                    </span>
                  </div>

                  <p className="mt-1.5 text-sm text-slate-700">
                    {alert.warning}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      <CloudRain size={12} />
                      {alert.expectedRainMm} mm on{" "}
                      {new Date(alert.expectedDate).toLocaleDateString(
                        "en-IN",
                        {
                          day: "numeric",
                          month: "short",
                        },
                      )}
                    </span>

                    {alert.sourceTags.slice(0, 2).map((tag) => (
                      <span
                        key={`${alert.id}-${tag}`}
                        className="rounded-full border border-slate-300/55 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                      >
                        {tag.replace("_", " ")}
                      </span>
                    ))}

                    {alert.sourceTags.length > 2 ? (
                      <span className="rounded-full border border-slate-300/55 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                        +{alert.sourceTags.length - 2} more
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}

              {hiddenFloodRiskAlerts > 0 ? (
                <p className="text-xs font-semibold text-slate-600">
                  +{hiddenFloodRiskAlerts} more risk zones hidden to keep this
                  panel readable. View full details on the map layer.
                </p>
              ) : null}
            </div>
          ) : !floodRiskLoading ? (
            <p className="mt-3 text-sm text-slate-600">
              No elevated flood-risk zones detected for current forecast.
            </p>
          ) : null}

          {floodRiskAutomationNote ? (
            <p className="mt-3 rounded-xl border border-slate-300/45 bg-white/70 p-3 text-xs font-semibold text-slate-600">
              {floodRiskAutomationNote}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
