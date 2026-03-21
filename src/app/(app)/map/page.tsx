"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { getVisibleIssues } from "@/lib/access";

const IssuesMap = dynamic(() => import("@/components/issues-map"), {
  ssr: false,
  loading: () => (
    <div className="ui-card p-6 text-sm text-slate-600">Loading map...</div>
  ),
});

export default function MapPage() {
  const issues = useAppStore((s) => s.issues);
  const sessionUser = useAppStore((s) => s.sessionUser);

  const visibleIssues = useMemo(
    () => getVisibleIssues(issues, sessionUser),
    [issues, sessionUser],
  );

  return (
    <div className="space-y-5">
      <header className="ui-card p-5">
        <h3 className="ui-page-title">Issue Map</h3>
        <p className="ui-page-subtitle">
          Google Maps is role-aware. Super admins see all markers, and other
          roles only see issues in their allowed department/area scope.
        </p>
      </header>

      <IssuesMap issues={visibleIssues} />
    </div>
  );
}
