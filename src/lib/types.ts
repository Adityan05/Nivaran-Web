export type Role = "super_admin" | "department_head" | "engineer";

export type IssueStatus =
  | "Reported"
  | "Acknowledged"
  | "In Progress"
  | "Resolved"
  | "Rejected";

export type Urgency = "Low" | "Medium" | "High";

export interface Department {
  id: string;
  code: string;
  name: string;
}

export interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  departmentId: string;
  area: string;
  workload: number;
  active: boolean;
}

export interface IssueComment {
  id: string;
  issueId: string;
  actorId: string;
  actorName: string;
  text: string;
  createdAt: string;
}

export interface IssueEvent {
  id: string;
  issueId: string;
  type:
    | "created"
    | "assignment"
    | "status_change"
    | "comment"
    | "sla"
    | "reroute";
  title: string;
  note?: string;
  actorId: string;
  actorName: string;
  createdAt: string;
}

export interface IssueRecord {
  id: string;
  title: string;
  description: string;
  category: string;
  urgency: Urgency;
  status: IssueStatus;
  area: string;
  assignedDepartmentId: string;
  assignedToId?: string;
  reporterName: string;
  createdAt: string;
  dueAt: string;
  affectedUsersCount: number;
  tags: string[];
  imageUrl: string;
  locationAddress: string;
  lat: number;
  lng: number;
  userId?: string;
  username?: string;
  upvotes?: number;
  downvotes?: number;
  commentsCount?: number;
  isUnresolved?: boolean;
  lastStatusUpdateAt?: string;
  lastStatusUpdateBy?: string;
  assignedDepartment?: string;
  affectedUserIds?: string[];
  voters?: Record<string, "upvote" | "downvote">;
  duplicateOfIssueId?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  issueId?: string;
}

export interface DashboardMetric {
  label: string;
  value: number;
  tone: "neutral" | "good" | "warn" | "danger";
}
