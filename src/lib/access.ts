import { IssueRecord, IssueStatus, Role, TeamMember } from "@/lib/types";

type SessionUser = TeamMember | null;

function isPrivileged(user: SessionUser): boolean {
  return user?.role === "super_admin";
}

export function canViewAllIssues(user: SessionUser): boolean {
  return isPrivileged(user);
}

export function canViewBoard(user: SessionUser): boolean {
  if (!user) {
    return false;
  }
  return (
    user.role === "super_admin" ||
    user.role === "department_head" ||
    user.role === "operator"
  );
}

export function canViewTeam(user: SessionUser): boolean {
  if (!user) {
    return false;
  }
  return (
    user.role === "super_admin" ||
    user.role === "department_head" ||
    user.role === "operator"
  );
}

export function canViewSettings(user: SessionUser): boolean {
  return user?.role === "super_admin";
}

export function canAssignIssue(user: SessionUser, issue: IssueRecord): boolean {
  if (!user) {
    return false;
  }
  if (user.role === "super_admin") {
    return true;
  }
  return (
    (user.role === "department_head" || user.role === "operator") &&
    user.departmentId === issue.assignedDepartmentId
  );
}

export function canUpdateIssueStatus(
  user: SessionUser,
  issue: IssueRecord,
): boolean {
  if (!user) {
    return false;
  }
  if (user.role === "super_admin") {
    return true;
  }

  if (user.role === "engineer") {
    return issue.assignedToId === user.id;
  }

  if (user.role === "department_head" || user.role === "operator") {
    return user.departmentId === issue.assignedDepartmentId;
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
    if (issue.status === "Resolved" || issue.status === "Rejected") {
      return [];
    }
    return ["Resolved"];
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
  if (user.role === "super_admin") {
    return true;
  }
  if (user.role === "engineer") {
    return issue.assignedToId === user.id;
  }
  return (
    issue.assignedDepartmentId === user.departmentId ||
    issue.area === user.area
  );
}

export function getVisibleIssues(
  issues: IssueRecord[],
  user: SessionUser,
): IssueRecord[] {
  if (!user) {
    return [];
  }
  if (canViewAllIssues(user)) {
    return issues;
  }
  return issues.filter((issue) => canAccessIssue(user, issue));
}

export function getVisibleUsers(
  users: TeamMember[],
  user: SessionUser,
): TeamMember[] {
  if (!user) {
    return [];
  }
  if (user.role === "super_admin") {
    return users;
  }
  if (user.role === "engineer") {
    return users.filter((u) => u.id === user.id);
  }
  return users.filter((u) => u.departmentId === user.departmentId);
}

export function canAccessRoute(pathname: string, role: Role): boolean {
  if (pathname.startsWith("/settings")) {
    return role === "super_admin";
  }

  if (pathname.startsWith("/team") || pathname.startsWith("/board")) {
    return (
      role === "super_admin" ||
      role === "department_head" ||
      role === "operator"
    );
  }

  return true;
}