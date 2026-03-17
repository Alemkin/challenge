# NOTES

## Setup

```bash
npm install
npm start        # runs via tsx (no compile step needed)
```

Requires Node ≥ 18. No external runtime dependencies — only `tsx` and `typescript` as dev tools.

---

## Time Spent

~1 hour.

---

## Verification Question Answers

All answers are produced by running `npm start`.

**Q1 — Base salary of job `5a13d80dcfed7957fe6c04a5` on 2019-05-05**
- Title: CTO
- Base salary: **$210,000**

**Q2 — Samson Oren's job (`5a13d80fcfed7957fe6c0511`) on 2019-04-30**
- Title: CFO
- Comp: $450,000 base, 50,000 ISO grant shares (USD)
- Manager: `5a13d80dcfed7957fe6c04a2` (CEO)
- Person: `5a13d80dcfed7957fe6c049d` (Samson Oren)
- isOpen: false, isDeleted: false

**Q3 — Open jobs on 2018-03-04**
- **2 open jobs**

**Q4 — Reports to Samson Oren on 2018-06-15**
- Jobs in subtree: **6**
- People (filled seats) in subtree: **4**

**Q5 — Total base compensation rolling up to CEO on 2018-06-15**
- **$1,111,000**

**Q6 — Changes on job `5a13d80fcfed7957fe6c0511` between 2018-01-01 and 2019-05-01**
- 4 UPDATE changes applied
- Fields that changed:
  - `title`: "VP of Finance" → "CFO"
  - `comp`: base $180,000 → $450,000 (grant shares and type unchanged)
  - `fields`: `{}` → populated custom fields

---

## Data Quality Issues

**1. Changes are not in chronological order.**
The prompt calls this out explicitly. Rather than pre-sorting the entire list (O(k log k) per job), `getJobOnDate` does a single linear scan and tracks a "latest writer wins" winner per field using `(date, createAt)` comparisons. Same correctness, better constant factors.

**2. Partial `comp` updates.**
Some UPDATE changes only set one or two subfields of `comp` (e.g. only `base`, leaving `grantShares` from an earlier change). A naïve last-write-wins on the whole `comp` object would clobber previously set subfields. Solution: track `comp` at the subkey level with a `SubW` (sub-winner) map so each subfield independently resolves to its most recent value.

**3. DELETE can precede a later CREATE (or be superseded by one).**
A DELETE is only treated as active if it is strictly more recent than the latest CREATE for the same job. This preserves jobs that were re-created after deletion.

**4. INACTIVE changes.**
Silently skipped per the spec — they are present in the dataset but must not affect state.

**5. Orphaned manager references.**
Some jobs reference a `managerId` that doesn't exist in the org on a given date (deleted, not yet created, etc.). These nodes are promoted to roots rather than silently dropped. The tree therefore has multiple roots on some dates; the CEO is identified by title when looking for the tree root.

---

## Complexity Analysis

### `getJobOnDate(jobId, date)` — O(k)
Single pass over the k changes for a job. No sorting. Each field uses a comparison-based winner, not position. Space: O(1) aside from the subfield winner maps (bounded by field count).

### `getGraphOnDate(date)` — O(J × k̄)
Calls `getJobOnDate` for every job J, then one more pass to link parent/child nodes. k̄ is average changes per job. Results are **memoized by date string** so repeated calls cost O(1).

### `getCompensationRollup(jobId, date)` — O(N)
Recursive DFS over the subtree rooted at `jobId`. N = nodes in subtree. Uses the cached graph so no tree rebuild cost.

### At 50,000 jobs / 500,000 changes

The in-memory approach still works but a few things would need to change:

- **Index changes by `(jobId, date)`** in a sorted structure (or a real DB with a composite index). Right now every `getJobOnDate` call scans all changes for that job — fine at 41 total, but at avg 10 changes/job × 50k jobs you're scanning 500k records on cold reads.
- **Lazy/paginated graph builds.** Building the full graph for a date currently pulls all 50k jobs. A subtree query (e.g. just Samson's reports) should be answerable without materialising the whole tree. A parent→children adjacency list built on demand, or a nested-set / path-enumeration model, would help.
- **Graph cache eviction.** The current cache grows unboundedly. At scale you'd want an LRU or TTL-based cache, or cache only "pinned" dates (e.g. month-end snapshots).
- **Compensation rollup.** Recursive DFS over 50k nodes is fine once, but if you need it for thousands of jobs simultaneously, a bottom-up aggregation pre-computed on tree build (or stored as a materialised column) would be more efficient.

---

## Assumptions & Tradeoffs

- `dateA` in `getChangesBetweenDates` is treated as an **inclusive baseline** — the snapshot at `dateA` is the "before" state, and changes with `date > dateA && date <= dateB` are the window. This matches the most natural reading of "between two dates."
- `getGraphOnDate` can return multiple roots (not just one CEO). The helper `findCeo` picks the node titled "CEO" or falls back to the first root. This handles datasets where the CEO seat is temporarily open or has a different title.
- The CSV escape function handles commas, quotes, and newlines in field values — important for title strings that could theoretically contain commas.
- No external libraries: all logic is plain TypeScript with Node's built-in `fs`. This keeps the setup trivially simple.

---

## AI Tool Usage

I used AI to generate all the code with back and forth input and some verification. The AI generated the docs as well. It is very good at this.

The reason I did this is even in my current job, when tasked with certain things at the level of data collections, functions, or even somewhat more complex restrcuturing of existing projects or data sets, AI helps me leverage my time even more effectively. I won't be wasting my time trying to do all of the implementation myself, especially when this is exactly what AI is best at, filling out algorithm based code to accomplish what you are looking for.

I'd be focused on overall systems design, architecture, and generally what the best direction to take is. This of course takes into account my coniderable experience without AI to know what is available and what direction should be taken most of the time, so I know how to direct AI and to avoid allowing it to become overcomplicated or create the wrong solutions. I also obviously do not use AI for every bit of code I write, but it allows for a lot more volume that is needed in different aspect in development, especially if you can automate certain aspect of it via all the new tools coming out. Happy to talk in depth about AI usage when we connect.

I also don't personally have 4-8 hours to spend on a take home project without guaruntee of a job, so I did hesitate to move forward with company that assigns take home projects, but with the assist of AI I can at least take this direction, explain why I did it, and have the face to face technical conversation at least.

---

## Test Coverage

`src/index.ts` runs two layers of tests after the verification questions:

**Performance tests (Perf 1–7):** Stress every core function against the full dataset using cross-products of all 9 job IDs × all change dates, ~288 weekly probe dates spanning 2016–2021, and 6 date windows of varying width. Each test is timed and asserts against a wall-clock budget (e.g. 500ms for 2,500+ `getJobOnDate` calls). A failed threshold sets `process.exitCode = 1`.

**Correctness tests (1–4):**
- Graph cache returns the same object reference on repeated calls (memoisation).
- CEO compensation rollup equals a manual DFS sum over all nodes.
- `getChangesBetweenDates` over full history records at least one diff for a job with known changes.
- Open-job count is ≥ 0 and ≤ total jobs on sampled dates.
