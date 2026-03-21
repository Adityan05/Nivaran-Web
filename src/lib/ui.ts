import { formatDistanceToNowStrict, isPast } from "date-fns";
import { IssueRecord, IssueStatus } from "@/lib/types";

export function statusBadgeClass(status: IssueStatus): string {
  switch (status) {
    case "Resolved":
      return "bg-emerald-100 text-emerald-700";
    case "In Progress":
      return "bg-amber-100 text-amber-700";
    case "Acknowledged":
      return "bg-sky-100 text-sky-700";
    case "Rejected":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function urgencyBadgeClass(urgency: IssueRecord["urgency"]): string {
  switch (urgency) {
    case "High":
      return "bg-rose-100 text-rose-700";
    case "Medium":
      return "bg-amber-100 text-amber-700";
    case "Low":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function formatRelative(isoDate: string): string {
  try {
    return formatDistanceToNowStrict(new Date(isoDate), { addSuffix: true });
  } catch {
    return isoDate;
  }
}

export function slaTone(issue: IssueRecord): "good" | "warn" | "danger" {
  if (issue.status === "Resolved" || issue.status === "Rejected") {
    return "good";
  }
  const due = new Date(issue.dueAt);
  const now = new Date();
  const hoursLeft = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (isPast(due)) {
    return "danger";
  }
  if (hoursLeft <= 8) {
    return "warn";
  }
  return "good";
}

export function slaClass(issue: IssueRecord): string {
  const tone = slaTone(issue);
  if (tone === "danger") {
    return "bg-rose-100 text-rose-700";
  }
  if (tone === "warn") {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-emerald-100 text-emerald-700";
}
