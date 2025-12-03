#  Diagnostics
Top 100 000 runs for 48 seconds

# Run an Execution plan 

Here’s the plan I suggest for Option 1 (index and statistics tuning):

- **Overview**  
  1. Capture current performance data: execution plan, logical reads, CPU time.  
  2. Inspect existing indexes and statistics to spot mismatches with the query shape.  
  3. Apply low-risk fixes (e.g., targeted `UPDATE STATISTICS`, adding/reordering predicates).  
  4. Measure the impact and iterate.

- **Step 1 – Gather baseline evidence**  
  Please run the following in SSMS against Azure SQL, copy the outputs (IO/time counters + plan), and share them so we can diagnose accurately:

  ```sql
  SET STATISTICS IO, TIME ON;
  SET STATISTICS PROFILE OFF;

  -- enable actual execution plan in SSMS (Ctrl+M) before running
  SELECT TOP (100000)    -- use your current query/stored view here
         b.PMPRNO,
         b.PMMSEQ,
         b.PMOPNO,
         b.PMMTNO,
         m.MMITNO,
         m.MMITDS,
         m.MMFUDS,
         m.MMDWNO
  FROM   M3FDBPRD.MPDMAT AS b
  WHERE  b.PMMSEQ = 1;
  ```

  **What to return:**  
  - The `SET STATISTICS IO` and `SET STATISTICS TIME` output text.  
  - The actual execution plan (you can save it as `.sqlplan` or grab the graphical summary with node costs).  
  - Any warnings (e.g., missing index suggestions).

Once you have those, let me know and we’ll move to Step 2.  
Confidence: Medium

[1 tool called]

Great question. To tune effectively we need evidence of what the Azure SQL optimizer is doing today; otherwise we risk guessing and making things worse. The `STATISTICS IO`/`TIME` output and actual execution plan show:

- which indexes (if any) the optimizer chooses,
- whether it’s scanning large row counts or spilling to tempdb,
- cardinality estimates vs. actual row counts,
- missing or stale statistics that might be driving the 48 s runtime.

With that snapshot we can propose targeted, low-risk adjustments (e.g., refreshing stats on specific indexes, reordering predicates, adding a covering index) and then verify the improvement. Without it we’d be blindfolded.

If collecting the execution plan isn’t feasible right now, let me know what information you can share—row counts, index definitions, or even the estimated plan—and we’ll adapt.  

[1 tool called]

An execution plan in SQL Server Management Studio (SSMS) is a visual (or XML) description of how SQL Server executes your query: which indexes it reads, join strategies chosen, estimated vs. actual row counts, and operator costs. It’s the core tool for diagnosing slow statements.

**How to capture it in SSMS**

1. Open a new query window and paste the statement you want to analyze.
2. Turn on the actual execution plan by pressing `Ctrl+M` or choosing `Query → Include Actual Execution Plan`. A “Execution Plan” tab will appear after the query runs.
   - If you only need the optimizer’s estimate (without running the query), use `Ctrl+L` or `Query → Display Estimated Execution Plan`.
3. Execute the query. When it finishes, switch to the “Execution Plan” tab at the bottom of the results pane.
4. (Optional) Right-click the plan to save it as `.sqlplan` if you want to share or archive it.

Let me know once you have the plan—we can read it together and target the tuning next.  
Confidence: High

# [1 tool called]

Thanks for the plan. A few quick takeaways:

- SQL Server is doing parallel hash joins over multiple nonclustered index scans (`MPDMAT40`, `MPDMAT30`, `MPDMAT10`). Each scan reads ~684 K rows, applies the `PMMSEQ = 1` filter late, and spills to tempdb. That explains the 88 s elapsed time and the heavy `PAGEIOLATCH_SH` waits.
- The optimizer even flagged a missing index: equality on `PMMSEQ` and INCLUDE `PMPRNO`, `PMOPNO`, `PMMTNO`. Right now none of the migrated indexes put `PMMSEQ` first, so it can’t seek; it has to scan.
- CPU is low (1.6 s), so we’re I/O bound. Fixing the access path is the most promising next step.

To keep moving, please run (in the same database) and share the results so we can choose the most surgical fix:

```sql
EXEC sys.sp_helpindex @objname = N'M3FDBPRD.MPDMAT';
GO
EXEC sys.sp_helpindex @objname = N'M3FDBPRD.MITMAS';
GO
```

Once we see the exact key order, we can decide whether to update statistics, add a covering index on `PMMSEQ` (or reorder an existing one), or reuse what’s there. After we tighten MPDMAT access, we’ll re-run the plan with the join to MITMAS.

Let me know when you have those index definitions.  
Confidence: Medium

Thanks for the index exports—they tell us exactly what we’re working with.

### What we’ve got
- Every `MPDMAT` index starts with `PMCONO` (many add `PMFACI`, `PMPRNO`, `PMSTRT`, then `PMMSEQ`). None lead with `PMPRNO` or `PMMSEQ` alone, so our current query can’t seek unless we filter on company/facility.
- `MITMAS` is in decent shape: the unique `MITMAS00 (MMCONO, MMITNO)` covers the join, and there are supporting indexes for descriptions, drawing numbers, etc.

### Options to improve the search view’s performance
1. **Leverage existing lead columns**  
   - *Approach:* Ensure the view (or callers) filter on `PMCONO` (and `PMFACI` when available). With those filters, the optimizer can use the current composite indexes without scanning all 650 K rows.  
   - *Pros:* No schema changes; quickest to try.  
   - *Cons:* Requires every search to supply those filters; if users often search across companies, performance gain is limited.

2. **Add a new covering index for the view pattern**  
   - *Approach:* Create a nonclustered index such as  
     `CREATE INDEX IX_MPDMAT_PMPRNO_PMMSEQ_PMOPNO_PMMTNO ON M3FDBPRD.MPDMAT (PMPRNO, PMMSEQ, PMOPNO, PMMTNO) INCLUDE (PMCONO, PMFACI, PMSTRT, PMFDAT);`  
     Adjust the INCLUDE list to match the columns you return frequently.  
   - *Pros:* Directly supports searches by product/component; keeps ORDER BY satisfied; works when `PMMSEQ` is optional.  
   - *Cons:* Extra storage and maintenance; you’ll want to measure write overhead.

3. **Refresh statistics + tune query shape first**  
   - *Approach:* Force a full-scan statistics update on `MPDMAT00/05/10/30`, then re-run the query with `SET STATISTICS IO/TIME`. You can also push predicates (e.g., `WHERE PMCONO = ?`) and collect the actual plan again.  
   - *Pros:* Safe first step; sometimes enough to get seeks on existing indexes if the filter selectivity is high.  
   - *Cons:* If the workload genuinely needs an index keyed by product, statistics alone won’t solve it.

Let me know which path you want to pursue and I’ll walk through the concrete steps.  
Confidence: Medium

# CREATE NEW INDEX
CREATE INDEX IX_MPDMAT_PMPRNO_PMMSEQ_PMOPNO_PMMTNO
ON M3FDBPRD.MPDMAT (PMPRNO, PMMSEQ, PMOPNO, PMMTNO);

[1 tool called]

Ah, sorry—that stray comma makes it invalid. Here’s the correct, compile-ready statement without any INCLUDE columns:

```sql
CREATE INDEX IX_MPDMAT_PMPRNO_PMMSEQ_PMOPNO_PMMTNO
ON M3FDBPRD.MPDMAT (PMPRNO, PMMSEQ, PMOPNO, PMMTNO);
```

Run this in Azure SQL, then re-run the `SELECT TOP (100000)` test with `SET STATISTICS IO, TIME ON` enabled and capture the actual execution plan so we can confirm it now seeks on the new index.  
Confidence: High