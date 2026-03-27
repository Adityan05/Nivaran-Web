"use client";

import { useEffect, useMemo, useRef } from "react";
import toast from "react-hot-toast";
import { getVisibleIssues } from "@/lib/access";
import { useAppStore } from "@/lib/store";
import type { IssueRecord } from "@/lib/types";

const POLL_INTERVAL_MS = 30_000;
const MAX_TOASTS_PER_CYCLE = 5;

function departmentLabel(issue: IssueRecord): string {
  const value = issue.assignedDepartment || issue.assignedDepartmentId;
  return value && value.trim() ? value : "Unknown department";
}

function zoneLabel(issue: IssueRecord): string {
  const value = issue.zoneId || issue.area || issue.locationAddress;
  return value && value.trim() ? value : "Unknown zone";
}

export function useIssueLiveRefresh(enabled = true) {
  const initMockData = useAppStore((s) => s.initMockData);
  const issues = useAppStore((s) => s.issues);
  const sessionUser = useAppStore((s) => s.sessionUser);

  const visibleIssues = useMemo(
    () => getVisibleIssues(issues, sessionUser),
    [issues, sessionUser],
  );

  const hasBootstrappedRef = useRef(false);
  const seenIssueIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !sessionUser) {
      return;
    }

    const id = window.setInterval(() => {
      void initMockData();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [enabled, initMockData, sessionUser]);

  useEffect(() => {
    if (!enabled || !sessionUser) {
      hasBootstrappedRef.current = false;
      seenIssueIdsRef.current = new Set();
      return;
    }

    const currentIssues = visibleIssues;

    if (!hasBootstrappedRef.current) {
      seenIssueIdsRef.current = new Set(currentIssues.map((issue) => issue.id));
      hasBootstrappedRef.current = true;
      return;
    }

    const seen = seenIssueIdsRef.current;
    const newIssues = currentIssues.filter((issue) => !seen.has(issue.id));

    if (newIssues.length > 0) {
      const isCommissioner = sessionUser.role === "commissioner";

      for (const issue of newIssues.slice(0, MAX_TOASTS_PER_CYCLE)) {
        const message = isCommissioner
          ? `New issue added: ${issue.id} (${departmentLabel(issue)} • ${zoneLabel(issue)})`
          : `New issue in your jurisdiction: ${issue.id}`;

        toast.success(message, {
          id: `new-issue-${issue.id}`,
        });
      }

      const overflow = newIssues.length - MAX_TOASTS_PER_CYCLE;
      if (overflow > 0) {
        toast.success(
          isCommissioner
            ? `${overflow} more new issues added across departments and zones.`
            : `${overflow} more new issues were added in your jurisdiction.`,
        );
      }
    }

    const nextSeen = new Set(seen);
    for (const issue of currentIssues) {
      nextSeen.add(issue.id);
    }
    seenIssueIdsRef.current = nextSeen;
  }, [enabled, visibleIssues, sessionUser]);
}
