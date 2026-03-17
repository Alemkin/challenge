import * as fs from 'fs';
import * as path from 'path';
import {
  Change,
  Comp,
  Person,
  JobSnapshot,
  OrgNode,
  ChangesBetweenDatesResult,
  FieldDiff,
} from './types';

// ── Data loading ─────────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '..');

const allChanges: Change[] = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'Take-home Prompt 1 - Changes.json'), 'utf-8')
);

const allPersons: Person[] = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'Take-home Prompt 2 - Persons.json'), 'utf-8')
);

const personMap = new Map<string, Person>(allPersons.map((p) => [p._id, p]));

// Group changes by jobId only — no sorting.
// In a real DB this maps to a table indexed on jobId; ordering is resolved at
// query time via comparisons, not by pre-sorting the data.
const changesByJobId = new Map<string, Change[]>();
for (const change of allChanges) {
  if (!changesByJobId.has(change.jobId)) changesByJobId.set(change.jobId, []);
  changesByJobId.get(change.jobId)!.push(change);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** True if (d2, at2) is strictly later than (d1, at1). YYYY-MM-DD and ISO strings sort lexicographically. */
const isLater = (d1: string, at1: string, d2: string, at2: string): boolean =>
  d2 > d1 || (d2 === d1 && at2 > at1);

/**
 * Subfield winner map: tracks, per key, the change (d, at) that last wrote it.
 * This lets us do per-subkey "last-write-wins" for merge fields (comp, fields)
 * without sorting — equivalent to chronological merge but O(k) instead of O(k log k).
 */
type SubW = Map<string, { d: string; at: string; v: unknown }>;

function updateSubW(map: SubW, data: Record<string, unknown>, d: string, at: string): void {
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const cur = map.get(k);
    if (!cur || isLater(cur.d, cur.at, d, at)) map.set(k, { d, at, v });
  }
}

function subWToObject(map: SubW): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, { v }] of map) obj[k] = v;
  return obj;
}

// ── Graph cache ───────────────────────────────────────────────────────────────

// Memoize getGraphOnDate results by date string. In a DB context this would be
// a query-result cache; here it prevents rebuilding the full tree for the same date.
const graphCache = new Map<string, OrgNode[]>();

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Returns a snapshot of a job's state on a given date (inclusive).
 *
 * Runs in O(k) with a single unsorted scan — no sort step.
 * Each logical field uses a "latest-writer-wins" tracker keyed on
 * (change.date, change.createAt) so chronological ordering is derived
 * purely from comparisons, not array position.
 *
 * Comp and custom fields are tracked per-subkey so a partial comp update
 * (e.g. only "base") preserves previously set subfields (e.g. "grantShares")
 * without needing a sort-then-merge pass.
 *
 * Data quality handling:
 *  - INACTIVE changes are ignored.
 *  - A DELETE older than a later CREATE is treated as superseded.
 *  - Two changes on the same date are resolved by createAt (later wins).
 */
export function getJobOnDate(jobId: string, date: string): JobSnapshot {
  const changes = changesByJobId.get(jobId) ?? [];

  // '' sentinel means "no winner yet"
  const wins = (winD: string, winAt: string, d: string, at: string) =>
    winD === '' || isLater(winD, winAt, d, at);

  let existsD = '',  existsAt = '';
  let deletedD = '', deletedAt = '';
  let hdD = '', hdAt = '', hdType: 'HIRE' | 'DEPART' | '' = '', hdPersonId: string | undefined;
  let titleD = '', titleAt = '', title: string | undefined;
  let mgrD = '',   mgrAt = '', managerId: string | undefined;

  const compW: SubW   = new Map();
  const fieldsW: SubW = new Map();

  for (const c of changes) {
    if (c.date > date || c.status !== 'ACTIVE') continue;
    const d = c.date, at = c.createAt;

    switch (c.type) {
      case 'CREATE':
        if (wins(existsD, existsAt, d, at)) { existsD = d; existsAt = at; }
        if (c.data?.title     !== undefined && wins(titleD, titleAt, d, at)) { titleD = d; titleAt = at; title = c.data.title; }
        if (c.data?.managerId !== undefined && wins(mgrD,   mgrAt,   d, at)) { mgrD   = d; mgrAt   = at; managerId = c.data.managerId; }
        if (c.data?.comp)   updateSubW(compW,   c.data.comp   as Record<string, unknown>, d, at);
        break;

      case 'DELETE':
        if (wins(deletedD, deletedAt, d, at)) { deletedD = d; deletedAt = at; }
        break;

      case 'HIRE':
        if (c.data?.personId !== undefined && wins(hdD, hdAt, d, at)) {
          hdD = d; hdAt = at; hdType = 'HIRE'; hdPersonId = c.data.personId;
        }
        break;

      case 'DEPART':
        if (wins(hdD, hdAt, d, at)) { hdD = d; hdAt = at; hdType = 'DEPART'; hdPersonId = undefined; }
        break;

      case 'UPDATE':
        if (c.data?.title     !== undefined && wins(titleD, titleAt, d, at)) { titleD = d; titleAt = at; title = c.data.title; }
        if (c.data?.managerId !== undefined && wins(mgrD,   mgrAt,   d, at)) { mgrD   = d; mgrAt   = at; managerId = c.data.managerId; }
        if (c.data?.comp)   updateSubW(compW,   c.data.comp   as Record<string, unknown>, d, at);
        if (c.data?.fields) updateSubW(fieldsW, c.data.fields as Record<string, unknown>, d, at);
        break;
    }
  }

  const exists    = existsD !== '';
  // Job is deleted only if the latest DELETE is more recent than the latest CREATE
  const isDeleted = deletedD !== '' && (existsD === '' || isLater(existsD, existsAt, deletedD, deletedAt));

  return {
    jobId,
    title,
    comp:      compW.size   > 0 ? (subWToObject(compW)   as Comp)                : undefined,
    managerId,
    personId:  hdType === 'HIRE' ? hdPersonId : undefined,
    fields:    subWToObject(fieldsW),
    isOpen:    hdType !== 'HIRE',
    isDeleted,
    exists,
  };
}

/**
 * Returns the org tree on a given date. Result is memoized by date string so
 * repeated calls for the same date (e.g. Q4, Q5, exportOrgOnDate) cost O(1)
 * after the first build.
 *
 * First-call complexity: O(J × k̄) where J = number of jobs and k̄ = average
 * changes per job.
 */
export function getGraphOnDate(date: string): OrgNode[] {
  if (graphCache.has(date)) return graphCache.get(date)!;

  const nodes = new Map<string, OrgNode>();

  for (const jobId of changesByJobId.keys()) {
    const snap = getJobOnDate(jobId, date);
    if (!snap.exists || snap.isDeleted) continue;

    const person = snap.personId ? personMap.get(snap.personId) : undefined;
    nodes.set(jobId, {
      jobId,
      title:      snap.title,
      personName: person ? `${person.name.first} ${person.name.last}` : undefined,
      isOpen:     snap.isOpen,
      managerId:  snap.managerId,
      comp:       snap.comp,
      children:   [],
    });
  }

  const roots: OrgNode[] = [];
  for (const node of nodes.values()) {
    if (node.managerId && nodes.has(node.managerId)) {
      nodes.get(node.managerId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  graphCache.set(date, roots);
  return roots;
}

/**
 * Returns a summary of what changed for a job between two dates.
 * dateA is the baseline (inclusive); dateB is the end (inclusive).
 */
export function getChangesBetweenDates(
  jobId: string,
  dateA: string,
  dateB: string
): ChangesBetweenDatesResult {
  const snapshotA = getJobOnDate(jobId, dateA);
  const snapshotB = getJobOnDate(jobId, dateB);

  const changes = changesByJobId.get(jobId) ?? [];
  const changesApplied = changes
    .filter((c) => c.status === 'ACTIVE' && c.date > dateA && c.date <= dateB)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createAt.localeCompare(b.createAt))
    .map((c) => ({ changeId: c._id, type: c.type, date: c.date }));

  const fieldDiffs: FieldDiff[] = [];
  const diff = (field: string, before: unknown, after: unknown) => {
    if (JSON.stringify(before) !== JSON.stringify(after))
      fieldDiffs.push({ field, before, after });
  };

  diff('title',     snapshotA.title,     snapshotB.title);
  diff('comp',      snapshotA.comp,      snapshotB.comp);
  diff('managerId', snapshotA.managerId, snapshotB.managerId);
  diff('personId',  snapshotA.personId,  snapshotB.personId);
  diff('isOpen',    snapshotA.isOpen,    snapshotB.isOpen);
  diff('isDeleted', snapshotA.isDeleted, snapshotB.isDeleted);
  diff('fields',    snapshotA.fields,    snapshotB.fields);

  return { jobId, dateA, dateB, changesApplied, fieldDiffs };
}

/**
 * Returns total base compensation for jobId and all jobs reporting through it.
 * Uses the cached graph — avoids rebuilding the tree when called after
 * getGraphOnDate for the same date.
 */
export function getCompensationRollup(jobId: string, date: string): number {
  const roots = getGraphOnDate(date); // O(1) if already cached

  function sumComp(node: OrgNode): number {
    return (node.comp?.base ?? 0) + node.children.reduce((s, c) => s + sumComp(c), 0);
  }

  function find(nodes: OrgNode[]): number | null {
    for (const node of nodes) {
      if (node.jobId === jobId) return sumComp(node);
      const sub = find(node.children);
      if (sub !== null) return sub;
    }
    return null;
  }

  return find(roots) ?? 0;
}

/**
 * Exports the full org state on a given date as a flat CSV.
 * Columns: jobId, title, personName (or "Open"), managerId, baseSalary
 */
export function exportOrgOnDate(date: string): string {
  const rows: string[] = ['jobId,title,personName,managerId,baseSalary'];
  const escape = (v: string) => (/[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

  function walk(node: OrgNode) {
    rows.push([
      escape(node.jobId),
      escape(node.title ?? ''),
      escape(node.personName ?? 'Open'),
      escape(node.managerId ?? ''),
      String(node.comp?.base ?? ''),
    ].join(','));
    for (const child of node.children) walk(child);
  }

  for (const root of getGraphOnDate(date)) walk(root);
  return rows.join('\n');
}
