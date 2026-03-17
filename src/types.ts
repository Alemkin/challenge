export interface Comp {
  currency?: string;
  base?: number;
  grantShares?: number;
  grantType?: string;
}

export interface ChangeData {
  title?: string;
  comp?: Comp;
  managerId?: string;
  personId?: string;
  departType?: string;
  promotionType?: string;
  fields?: Record<string, unknown>;
}

export type ChangeType = 'CREATE' | 'HIRE' | 'UPDATE' | 'DEPART' | 'DELETE';
export type ChangeStatus = 'ACTIVE' | 'INACTIVE';

export interface Change {
  _id: string;
  jobId: string;
  type: ChangeType;
  date: string; // YYYY-MM-DD
  status: ChangeStatus;
  data?: ChangeData;
  createAt: string; // ISO timestamp (tiebreaker for same-date ordering)
  announceDate?: string;
  statusAt?: string;
}

export interface Person {
  _id: string;
  name: {
    first: string;
    last: string;
  };
  createAt: string;
}

export interface JobSnapshot {
  jobId: string;
  title?: string;
  comp?: Comp;
  managerId?: string;
  personId?: string;
  fields: Record<string, unknown>;
  isOpen: boolean;    // true if no person is currently filling this job
  isDeleted: boolean; // true if DELETE change has been applied
  exists: boolean;    // false if no CREATE change has been seen yet
}

export interface OrgNode {
  jobId: string;
  title?: string;
  personName?: string; // undefined when open
  isOpen: boolean;
  managerId?: string;
  comp?: Comp;
  children: OrgNode[];
}

export interface ChangeSummaryEntry {
  changeId: string;
  type: ChangeType;
  date: string;
}

export interface FieldDiff {
  field: string;
  before: unknown;
  after: unknown;
}

export interface ChangesBetweenDatesResult {
  jobId: string;
  dateA: string;
  dateB: string;
  changesApplied: ChangeSummaryEntry[];
  fieldDiffs: FieldDiff[];
}
