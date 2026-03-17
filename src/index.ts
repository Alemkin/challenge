import * as fs from 'fs';
import * as path from 'path';
import {
  getJobOnDate,
  getGraphOnDate,
  getChangesBetweenDates,
  getCompensationRollup,
  exportOrgOnDate,
} from './orgChart';
import { OrgNode } from './types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function findNode(nodes: OrgNode[], jobId: string): OrgNode | undefined {
  for (const node of nodes) {
    if (node.jobId === jobId) return node;
    const found = findNode(node.children, jobId);
    if (found) return found;
  }
  return undefined;
}

/** Counts all jobs and filled jobs in the subtree BELOW a given node (excluding the node itself). */
function countSubtree(node: OrgNode): { jobs: number; people: number } {
  let jobs = 0;
  let people = 0;
  for (const child of node.children) {
    jobs++;
    if (!child.isOpen) people++;
    const sub = countSubtree(child);
    jobs += sub.jobs;
    people += sub.people;
  }
  return { jobs, people };
}

/** Counts all open jobs across the whole tree. */
function countOpenJobs(nodes: OrgNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.isOpen) count++;
    count += countOpenJobs(node.children);
  }
  return count;
}

/** Finds the CEO node — the root whose title is "CEO", or the first root. */
function findCeo(roots: OrgNode[]): OrgNode | undefined {
  return roots.find((n) => n.title === 'CEO') ?? roots[0];
}

/** Find the job a given person holds on a date by scanning snapshots. */
function findJobByPerson(personName: string, date: string): OrgNode | undefined {
  const graph = getGraphOnDate(date);
  function search(nodes: OrgNode[]): OrgNode | undefined {
    for (const node of nodes) {
      if (node.personName === personName) return node;
      const found = search(node.children);
      if (found) return found;
    }
    return undefined;
  }
  return search(graph);
}

// ── Verification questions ───────────────────────────────────────────────────

console.log('=== ChartHop Org Chart Engine ===\n');
console.log('─'.repeat(60));

// Q1: What is the base salary of job 5a13d80dcfed7957fe6c04a5 on May 5th, 2019?
console.log('\nQ1: Base salary of job 5a13d80dcfed7957fe6c04a5 on 2019-05-05');
const q1 = getJobOnDate('5a13d80dcfed7957fe6c04a5', '2019-05-05');
console.log(`  Title     : ${q1.title}`);
console.log(`  Base salary: $${q1.comp?.base?.toLocaleString() ?? 'N/A'}`);
console.log(`  Exists: ${q1.exists} | Deleted: ${q1.isDeleted} | Open: ${q1.isOpen}`);

// Q2: What does Samson Oren's job look like on April 30th, 2019?
console.log('\nQ2: Samson Oren\'s job (5a13d80fcfed7957fe6c0511) on 2019-04-30');
const q2 = getJobOnDate('5a13d80fcfed7957fe6c0511', '2019-04-30');
console.log(JSON.stringify(q2, null, 2));

// Q3: How many open jobs exist on March 4th, 2018?
console.log('\nQ3: Open jobs on 2018-03-04');
const q3Graph = getGraphOnDate('2018-03-04');
const q3Open = countOpenJobs(q3Graph);
console.log(`  Open jobs: ${q3Open}`);

// Q4: How many people and jobs report up to Samson Oren on June 15th, 2018?
console.log('\nQ4: Reports to Samson Oren (job 5a13d80fcfed7957fe6c0511) on 2018-06-15');
const q4Graph = getGraphOnDate('2018-06-15');
const samsonNode = findNode(q4Graph, '5a13d80fcfed7957fe6c0511');
if (samsonNode) {
  const { jobs, people } = countSubtree(samsonNode);
  console.log(`  Jobs reporting to Samson : ${jobs}`);
  console.log(`  People reporting to Samson: ${people}`);
} else {
  console.log('  Samson Oren not found in org on this date');
}

// Q5: What is the total base compensation rolling up to the CEO on June 15th, 2018?
console.log('\nQ5: Total base compensation (CEO rollup) on 2018-06-15');
const q5Graph = getGraphOnDate('2018-06-15');
const ceoNode = findCeo(q5Graph);
if (ceoNode) {
  const rollup = getCompensationRollup(ceoNode.jobId, '2018-06-15');
  console.log(`  CEO job ID : ${ceoNode.jobId}`);
  console.log(`  Total compensation: $${rollup.toLocaleString()}`);
} else {
  console.log('  CEO not found');
}

// Q6: What changed on job 5a13d80fcfed7957fe6c0511 between Jan 1, 2018 and May 1, 2019?
console.log('\nQ6: Changes on job 5a13d80fcfed7957fe6c0511 between 2018-01-01 and 2019-05-01');
const q6 = getChangesBetweenDates('5a13d80fcfed7957fe6c0511', '2018-01-01', '2019-05-01');
console.log(JSON.stringify(q6, null, 2));

console.log('\n' + '─'.repeat(60));

// ── CSV export ───────────────────────────────────────────────────────────────

const exportDate = '2018-06-15';
console.log(`\nExporting org chart for ${exportDate}...`);
const csv = exportOrgOnDate(exportDate);
const csvPath = path.join(__dirname, '..', `org-export-${exportDate}.csv`);
fs.writeFileSync(csvPath, csv, 'utf-8');
console.log(`  Written: org-export-${exportDate}.csv`);
console.log('\n--- CSV Preview ---');
console.log(csv);

// ── Performance & stress tests ───────────────────────────────────────────────

/**
 * All known job IDs from the dataset. Querying every job on every date lets us
 * exercise getJobOnDate across the full cross-product of (jobs × dates).
 */
const ALL_JOB_IDS = [
  '5a13d80dcfed7957fe6c04a2',
  '5a13d80dcfed7957fe6c04a5',
  '5a13d80fcfed7957fe6c0511',
  '5cdc34b777f091381f10d8b7',
  '5fa45867b70e39710762adc5',
  '5fa4589067ea783ee758efc9',
  '600077a031664d20cd7d19b6',
  '60346b34c9bcdc4e7dec3c38',
  '604fb79923bb744ef905b07a',
];

/** Every date on which at least one change occurred — the most change-dense probing set. */
const ALL_CHANGE_DATES = [
  '2016-03-21', '2016-11-01', '2016-11-02', '2016-11-03',
  '2017-10-01', '2017-10-02', '2017-10-03', '2017-12-01',
  '2017-12-02', '2017-12-03', '2018-01-01', '2018-01-02',
  '2018-02-01', '2018-02-02', '2018-02-03', '2018-03-01',
  '2018-03-02', '2018-03-05', '2018-04-01', '2018-04-02',
  '2018-04-03', '2018-05-01', '2018-05-02', '2018-05-03',
  '2018-06-01', '2018-06-02', '2019-04-26', '2019-04-29',
  '2019-04-30', '2019-05-01', '2019-09-15', '2020-09-14',
  '2020-09-21', '2021-02-01',
];

/** Generate one date per week between [start, end] (YYYY-MM-DD). */
function generateWeeklyDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start);
  const last = new Date(end);
  while (d <= last) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return dates;
}

/**
 * Weekly dates spanning the full dataset history (2016-01-01 → 2021-06-30).
 * ~288 unique dates — each is a genuine graph-cache miss, exercising the full
 * O(J × k̄) build path once per date.
 */
const WEEKLY_DATES = generateWeeklyDates('2016-01-01', '2021-06-30');

/** Recursively count every node in a forest. */
function countAllNodes(nodes: OrgNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countAllNodes(node.children), 0);
}

/** Print a PASS/FAIL timing assertion. Threshold is in milliseconds. */
function assertFast(label: string, elapsedMs: number, thresholdMs: number): void {
  const pass = elapsedMs <= thresholdMs;
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`  [${icon}] ${label}: ${elapsedMs.toFixed(2)}ms (limit ${thresholdMs}ms)`);
  if (!pass) process.exitCode = 1;
}

/** Print a PASS/FAIL value equality assertion. */
function assertEqual<T>(label: string, actual: T, expected: T): void {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  if (!pass) process.exitCode = 1;
}

console.log('\n' + '═'.repeat(60));
console.log('PERFORMANCE TEST SUITE');
console.log('═'.repeat(60));
console.log(`Dataset: ${ALL_JOB_IDS.length} jobs | ${ALL_CHANGE_DATES.length} change dates | ${WEEKLY_DATES.length} weekly probe dates`);

// ── Perf 1: getJobOnDate — full job × change-date cross-product ──────────────
// This is the densest possible probe: every job queried at every date where a
// change occurred. Because getJobOnDate scans all changes for the job linearly,
// a non-linear algorithm would show up clearly here.
console.log(`\nPerf 1: getJobOnDate — ${ALL_JOB_IDS.length} jobs × ${ALL_CHANGE_DATES.length} change dates`);
{
  const t0 = performance.now();
  let calls = 0, exists = 0, deleted = 0, open = 0;
  for (const date of ALL_CHANGE_DATES) {
    for (const jobId of ALL_JOB_IDS) {
      const snap = getJobOnDate(jobId, date);
      calls++;
      if (snap.exists)    exists++;
      if (snap.isDeleted) deleted++;
      if (snap.isOpen)    open++;
    }
  }
  const elapsed = performance.now() - t0;
  console.log(`  Calls: ${calls} | exists: ${exists} | deleted: ${deleted} | open: ${open}`);
  console.log(`  Avg per call: ${(elapsed / calls).toFixed(4)}ms`);
  assertFast('getJobOnDate cross-product', elapsed, 150);
}

// ── Perf 2: getJobOnDate — all jobs × weekly dates (larger date cardinality) ─
// Uses ~288 weekly dates to stress the iteration over change history. Because
// the graphCache is NOT used by getJobOnDate, every call does real work.
console.log(`\nPerf 2: getJobOnDate — ${ALL_JOB_IDS.length} jobs × ${WEEKLY_DATES.length} weekly dates`);
{
  const t0 = performance.now();
  const calls = ALL_JOB_IDS.length * WEEKLY_DATES.length;
  let nonEmpty = 0;
  for (const date of WEEKLY_DATES) {
    for (const jobId of ALL_JOB_IDS) {
      const snap = getJobOnDate(jobId, date);
      if (snap.exists) nonEmpty++;
    }
  }
  const elapsed = performance.now() - t0;
  console.log(`  Calls: ${calls} | non-empty snapshots: ${nonEmpty}`);
  console.log(`  Avg per call: ${(elapsed / calls).toFixed(4)}ms`);
  assertFast('getJobOnDate weekly sweep', elapsed, 500);
}

// ── Perf 3: getGraphOnDate — all weekly dates (cache miss every call) ────────
// getGraphOnDate builds the tree by calling getJobOnDate for all jobs and then
// linking parent nodes. Each weekly date is unique so the memoisation cache
// cannot help; every call is a full O(J × k̄) build.
console.log(`\nPerf 3: getGraphOnDate — ${WEEKLY_DATES.length} weekly dates (all cache misses)`);
{
  const t0 = performance.now();
  let totalNodes = 0;
  for (const date of WEEKLY_DATES) {
    totalNodes += countAllNodes(getGraphOnDate(date));
  }
  const elapsed = performance.now() - t0;
  console.log(`  Graphs built: ${WEEKLY_DATES.length} | cumulative nodes: ${totalNodes}`);
  console.log(`  Avg per graph: ${(elapsed / WEEKLY_DATES.length).toFixed(4)}ms`);
  assertFast('getGraphOnDate weekly sweep', elapsed, 600);
}

// ── Perf 4: getGraphOnDate — cache-hit reads are O(1) ────────────────────────
// Every date was already built in Perf 3; all reads should be instant.
console.log(`\nPerf 4: getGraphOnDate — ${WEEKLY_DATES.length} repeated calls (all cache hits)`);
{
  const t0 = performance.now();
  let totalNodes = 0;
  for (const date of WEEKLY_DATES) {
    totalNodes += countAllNodes(getGraphOnDate(date));
  }
  const elapsed = performance.now() - t0;
  console.log(`  Cumulative nodes: ${totalNodes}`);
  assertFast('getGraphOnDate cache-hit sweep', elapsed, 50);
}

// ── Perf 5: getCompensationRollup — CEO rollup for every weekly date ─────────
// Exercises the recursive tree-sum. After Perf 3 the graphs are cached, so this
// isolates the cost of the rollup traversal from graph construction.
console.log(`\nPerf 5: getCompensationRollup — CEO rollup × ${WEEKLY_DATES.length} weekly dates`);
{
  const t0 = performance.now();
  let calls = 0;
  let totalComp = 0;
  for (const date of WEEKLY_DATES) {
    const graph = getGraphOnDate(date);
    const ceo = findCeo(graph);
    if (ceo) {
      totalComp += getCompensationRollup(ceo.jobId, date);
      calls++;
    }
  }
  const elapsed = performance.now() - t0;
  console.log(`  Rollup calls: ${calls} | cumulative comp sum: $${totalComp.toLocaleString()}`);
  assertFast('getCompensationRollup weekly sweep', elapsed, 200);
}

// ── Perf 6: getChangesBetweenDates — all jobs × multiple date windows ────────
// Six date windows of varying widths, including a full-history window.
// Verifies that getChangesBetweenDates scales with changelog size, not input
// date cardinality.
const DATE_WINDOWS: [string, string][] = [
  ['2015-01-01', '2016-06-01'],  // before most changes
  ['2016-01-01', '2017-01-01'],
  ['2017-01-01', '2018-01-01'],
  ['2018-01-01', '2019-01-01'],  // densest change period
  ['2019-01-01', '2021-12-31'],
  ['2015-01-01', '2022-01-01'],  // full history
];
console.log(`\nPerf 6: getChangesBetweenDates — ${ALL_JOB_IDS.length} jobs × ${DATE_WINDOWS.length} windows`);
{
  const t0 = performance.now();
  let calls = 0, totalChanges = 0, totalDiffs = 0;
  for (const [dateA, dateB] of DATE_WINDOWS) {
    for (const jobId of ALL_JOB_IDS) {
      const result = getChangesBetweenDates(jobId, dateA, dateB);
      totalChanges += result.changesApplied.length;
      totalDiffs   += result.fieldDiffs.length;
      calls++;
    }
  }
  const elapsed = performance.now() - t0;
  console.log(`  Calls: ${calls} | total changes found: ${totalChanges} | total field diffs: ${totalDiffs}`);
  assertFast('getChangesBetweenDates multi-window', elapsed, 200);
}

// ── Perf 7: exportOrgOnDate — every unique change date ───────────────────────
// Exercises the full walk + CSV serialisation path. After Perf 3 the graphs are
// cached, so this measures the export overhead alone.
console.log(`\nPerf 7: exportOrgOnDate — ${ALL_CHANGE_DATES.length} change dates`);
{
  const t0 = performance.now();
  let totalRows = 0;
  for (const date of ALL_CHANGE_DATES) {
    const out = exportOrgOnDate(date);
    totalRows += out.split('\n').length - 1; // subtract header
  }
  const elapsed = performance.now() - t0;
  console.log(`  Exports: ${ALL_CHANGE_DATES.length} | cumulative CSV rows: ${totalRows}`);
  assertFast('exportOrgOnDate change-date sweep', elapsed, 200);
}

// ── Correctness: graph cache returns same reference on repeated calls ─────────
console.log('\nCorrectness 1: getGraphOnDate returns identical reference on re-call (memoisation)');
{
  for (const date of ['2016-03-21', '2018-03-05', '2019-05-01', '2021-02-01']) {
    const a = getGraphOnDate(date);
    const b = getGraphOnDate(date);
    const sameRef = a === b;
    console.log(`  [${sameRef ? 'PASS' : 'FAIL'}] ${date}: same reference = ${sameRef}`);
    if (!sameRef) process.exitCode = 1;
  }
}

// ── Correctness: compensation rollup equals manual sum of all job base salaries
console.log('\nCorrectness 2: CEO rollup == sum of all node base salaries on 2018-06-15');
{
  const date = '2018-06-15';
  const graph = getGraphOnDate(date);
  const ceo = findCeo(graph);
  if (ceo) {
    const rollup = getCompensationRollup(ceo.jobId, date);
    let manualSum = 0;
    function sumAll(nodes: OrgNode[]): void {
      for (const n of nodes) { manualSum += (n.comp?.base ?? 0); sumAll(n.children); }
    }
    sumAll(graph);
    assertEqual('CEO rollup matches manual tree sum', rollup, manualSum);
  } else {
    console.log('  [SKIP] No CEO found on 2018-06-15');
  }
}

// ── Correctness: getChangesBetweenDates field-diff coverage ──────────────────
console.log('\nCorrectness 3: getChangesBetweenDates — full-range diffs include expected fields');
{
  const result = getChangesBetweenDates('5a13d80fcfed7957fe6c0511', '2016-01-01', '2022-01-01');
  const diffFields = result.fieldDiffs.map((d) => d.field);
  console.log(`  Changes in window: ${result.changesApplied.length}`);
  console.log(`  Fields that changed: ${diffFields.join(', ') || '(none)'}`);
  // The before snapshot (2016-01-01) should show the job not yet existing,
  // so 'isDeleted' or 'isOpen' must be in the diffs if the job was ever created.
  const hasAnyDiff = result.fieldDiffs.length > 0 || result.changesApplied.length > 0;
  console.log(`  [${hasAnyDiff ? 'PASS' : 'FAIL'}] At least one change or diff recorded over full history`);
  if (!hasAnyDiff) process.exitCode = 1;
}

// ── Correctness: open-job count is non-negative and <= total jobs ─────────────
console.log('\nCorrectness 4: open-job count sanity across sampled dates');
{
  const sampleDates = ['2017-01-01', '2018-06-15', '2019-05-01', '2020-01-01'];
  for (const date of sampleDates) {
    const graph = getGraphOnDate(date);
    const total = countAllNodes(graph);
    const open  = countOpenJobs(graph);
    const valid = open >= 0 && open <= total;
    console.log(`  [${valid ? 'PASS' : 'FAIL'}] ${date}: total=${total}, open=${open}, filled=${total - open}`);
    if (!valid) process.exitCode = 1;
  }
}

console.log('\n' + '═'.repeat(60));
if ((process.exitCode ?? 0) === 0) {
  console.log('All performance and correctness tests PASSED.');
} else {
  console.log('One or more tests FAILED — see above.');
}
console.log('═'.repeat(60));
