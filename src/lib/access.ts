import { IssueRecord, IssueStatus, Role, TeamMember } from "@/lib/types";
import { inferZoneId, isSameZone } from "@/lib/zones";

type SessionUser = TeamMember | null;

function isPrivileged(user: SessionUser): boolean {
  return user?.role === "commissioner";
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function getIssueZoneId(issue: IssueRecord): string | undefined {
  return inferZoneId({
    explicitZoneId: issue.zoneId,
    area: issue.area || issue.locationAddress,
    lat: issue.lat,
    lng: issue.lng,
  });
}

function isInUserZone(user: TeamMember, issue: IssueRecord): boolean {
  const issueZoneId = getIssueZoneId(issue);
  if (user.zoneId && issueZoneId) {
    return isSameZone(user.zoneId, issueZoneId);
  }
  if (user.area && issue.area) {
    return normalizeText(user.area) === normalizeText(issue.area);
  }
  return false;
}

function isDirectlyAssignedToUser(user: TeamMember, issue: IssueRecord): boolean {
  return issue.assignedToId === user.id;
}

export function canViewAllIssues(user: SessionUser): boolean {
  return isPrivileged(user);
}

export function canViewBoard(user: SessionUser): boolean {
  if (!user) {
    return false;
  }
  return (
    user.role === "commissioner" ||
    user.role === "department_head" ||
    user.role === "zonal_officer"
  );
}

export function canAssignIssue(user: SessionUser, issue: IssueRecord): boolean {
  if (!user) {
    return false;
  }
  if (
    issue.status === "Resolved" ||
    issue.status === "Verified" ||
    issue.status === "Rejected"
  ) {
    return false;
  }
  if (user.role === "commissioner") {
    return true;
  }

  if (user.role === "zonal_officer" && isDirectlyAssignedToUser(user, issue)) {
    return true;
  }

  return (
    user.role === "zonal_officer" &&
    user.departmentId === issue.assignedDepartmentId &&
    isInUserZone(user, issue)
  );
}

export function canAssignToUser(
  user: SessionUser,
  assignee: TeamMember,
  issue: IssueRecord,
): boolean {
  if (!user) {
    return false;
  }
  if (!canAssignIssue(user, issue)) {
    return false;
  }

  if (user.role === "commissioner") {
    if (assignee.departmentId !== issue.assignedDepartmentId) {
      return false;
    }

    if (assignee.role === "zonal_officer") {
      return true;
    }

    if (assignee.role === "engineer") {
      const issueZoneId = getIssueZoneId(issue);
      if (!issueZoneId || !assignee.zoneId) {
        return true;
      }
      return issueZoneId === assignee.zoneId;
    }

    return false;
  }

  if (user.role === "zonal_officer") {
    const issueZoneId = getIssueZoneId(issue);
    if (!issueZoneId || !user.zoneId || issueZoneId !== user.zoneId) {
      return false;
    }

    return (
      assignee.role === "engineer" &&
      assignee.departmentId === user.departmentId &&
      assignee.departmentId === issue.assignedDepartmentId &&
      assignee.zoneId === user.zoneId
    );
  }

  return false;
}

export function canRerouteIssue(user: SessionUser, issue: IssueRecord): boolean {
  if (!user) {
    return false;
  }
  if (
    issue.status === "Resolved" ||
    issue.status === "Verified" ||
    issue.status === "Rejected"
  ) {
    return false;
  }
  if (user.role === "commissioner") {
    return true;
  }

  if (user.role === "zonal_officer" && isDirectlyAssignedToUser(user, issue)) {
    return true;
  }

  return (
    user.role === "zonal_officer" &&
    user.departmentId === issue.assignedDepartmentId &&
    isInUserZone(user, issue)
  );
}

export function canUpdateIssueStatus(
  user: SessionUser,
  issue: IssueRecord,
): boolean {
  if (!user) {
    return false;
  }
  if (user.role === "commissioner") {
    return true;
  }

  if (user.role === "engineer") {
    return issue.assignedToId === user.id;
  }

  if (user.role === "zonal_officer") {
    if (isDirectlyAssignedToUser(user, issue)) {
      return true;
    }

    return (
      user.departmentId === issue.assignedDepartmentId &&
      isInUserZone(user, issue)
    );
  }

  return false;
}

export function getAllowedStatusTransitions(
  user: SessionUser,
  issue: IssueRecord,
): IssueStatus[] {
  if (!canUpdateIssueStatus(user, issue)) {
    return [];
  }

  if (user?.role === "engineer") {
    if (
      issue.status === "Resolved" ||
      issue.status === "Verified" ||
      issue.status === "Rejected"
    ) {
      return [];
    }
    return ["Resolved"];
  }

  if (user?.role === "department_head") {
    return [];
  }

  switch (issue.status) {
    case "Reported":
      return ["Acknowledged", "Rejected"];
    case "Acknowledged":
      return ["In Progress", "Rejected"];
    case "In Progress":
      return ["Resolved", "Rejected"];
    default:
      return [];
  }
}

export function canAccessIssue(user: SessionUser, issue: IssueRecord): boolean {
  if (!user) {
    return false;
  }

  if (issue.status === "Verified") {
    return false;
  }

  if (user.role === "commissioner") {
    return true;
  }
  if (user.role === "engineer") {
    return issue.assignedToId === user.id;
  }
  if (user.role === "department_head") {
    return issue.assignedDepartmentId === user.departmentId;
  }
  if (user.role === "zonal_officer") {
    if (isDirectlyAssignedToUser(user, issue)) {
      return true;
    }

    return (
      issue.assignedDepartmentId === user.departmentId &&
      isInUserZone(user, issue)
    );
  }
  return false;
}

export function getVisibleIssues(
  issues: IssueRecord[],
  user: SessionUser,
): IssueRecord[] {
  if (!user) {
    return [];
  }
  const issuesWithoutVerified = issues.filter(
    (issue) => issue.status !== "Verified",
  );
  if (canViewAllIssues(user)) {
    return issuesWithoutVerified;
  }
  return issuesWithoutVerified.filter((issue) => canAccessIssue(user, issue));
}

export function getVisibleUsers(
  users: TeamMember[],
  user: SessionUser,
): TeamMember[] {
  if (!user) {
    return [];
  }
  if (user.role === "commissioner") {
    return users;
  }
  if (user.role === "engineer") {
    return users.filter((u) => u.id === user.id);
  }

  if (user.role === "zonal_officer") {
    return users.filter(
      (u) =>
        u.id === user.id ||
        (u.role === "engineer" &&
          u.departmentId === user.departmentId &&
          u.zoneId === user.zoneId),
    );
  }

  return users.filter((u) => u.departmentId === user.departmentId);
}

export function canAccessRoute(pathname: string, role: Role): boolean {
  if (pathname.startsWith("/board")) {
    return (
      role === "commissioner" ||
      role === "department_head" ||
      role === "zonal_officer"
    );
  }

  return true;
}