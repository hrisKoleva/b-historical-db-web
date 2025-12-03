Below is a **clean, standalone document** containing only the **final, approved, senior-architect-level guidelines** distilled from everything above.
This is not merged with your DAL spec. It is an **add-on document** you can place next to it (e.g., `DAL_Performance_And_AI_Guidelines.md`).
It contains:

* AI-agent execution rules
* Performance scalability rules
* Mandatory infra requirements
* Optional optimizations
* Clear “when to use what”

---

# **Data Access Layer – Final Guidelines (AI-Agent + Performance Edition)**

### *Standalone Addendum for Implementation, Scaling, and AI Automation*

This document supplements the main DAL Architecture Specification.
It defines **how the AI agent must execute the spec** and **the required performance/scalability rules** for production use with large datasets (600K–15M rows) and multi-schema / multi database environments.

---

# **1. AI AGENT EXECUTION RULES**

### **1.1. Purpose**

This document is a *control guide* for the AI agent.
It MUST NOT be copied into generated source files.

### **1.2. File creation rules**

* Only create/edit files at the **exact paths** specified in the main DAL spec.
* If a file already exists → **modify in place**.
  Never create duplicates (e.g., `customerRepository2.ts`).

### **1.3. Comment rules**

* In code, keep only:

  * Purpose comments,
  * Parameter docs,
  * Performance notes.
* Do NOT include:

  * “WAIT FOR APPROVAL”
  * Execution phases
  * Checklists
  * Orchestration instructions
  * Meta explanations

Production code must be clean, technical, and minimal.

### **1.4. Orchestration rules**

* “WAIT FOR APPROVAL”, “Phase 1/2/3”, “Next Action” are **orchestration markers** only.
* The AI agent MUST NOT:

  * Copy these to code files
  * Implement logic related to “approval”
  * Interpret these phrases literally

Phase transitions are decided by the orchestration layer or human operator.

### **1.5. Idempotence**

* Before writing, always check if file exists.
  If yes: **update**, don’t recreate.
* Never generate multiple versions of the same query or repository.

### **1.6. SQL file handling**

* Keep SQL files pure `.sql`.
* Must include:

  * Purpose
  * Parameters
  * Index requirements / performance expectations
* No process or orchestration comments.
* Use only approved placeholders (`{{SCHEMA_PRIMARY}}`, etc.).

### **1.7. TypeScript file handling**

* Follow naming conventions strictly.
* Keep only minimal comments describing responsibility.
* Ensure imports resolve correctly in the repo structure.
* Ensure all generated TS passes type checking.

---

# **2. REQUIRED PERFORMANCE & SCALABILITY RULES (MANDATORY)**

These MUST be implemented before production.

---

## **2.1. Pagination Strategy**

### **Rule A — Offset Pagination is Allowed BUT Only for Shallow Pages**

Offset-based pagination (`OFFSET n ROWS`) is allowed only when:

* Users typically view the first few pages only (e.g., 1–10)
* Table size < 1M **or**
* Indexes align with the ORDER BY columns

### **Rule B — Keyset Pagination for Large / Deep Lists**

Use **keyset (cursor) pagination** for large tables or deep navigation:

```
WHERE (@lastSeenId IS NULL OR id > @lastSeenId)
ORDER BY id
FETCH NEXT @limit ROWS ONLY;
```

Use cases:

* Tables > 1M rows
* Infinite scroll
* Drill-down lists where users can scroll deeply

### **AI-Agent Rule:**

*Do not auto-convert all queries to keyset; only those explicitly marked “large set” or “deep paging”.*

---

## **2.2. COUNT(*) Strategy**

Exact `COUNT(*)` is allowed only when:

* A supporting index exists on the WHERE filters
* Estimated execution time < 300ms

### Alternatives:

* **Approximate count** using `sys.partitions`
* **No count** (infinite scroll/“Load more” UX)
* **Precomputed/materialized counts** (later optimization)

### **UI Rule:**

The UI is allowed to omit “Page X of Y”. “Load More” is acceptable.

---

## **2.3. Cross-Database Join Rules**

### **Rule A — If schemas live in the SAME Azure SQL database**

Cross-schema joins are allowed.

### **Rule B — If schemas are on DIFFERENT databases 
* Application-level join for small cardinalities only

Below is a **clean, standalone document** containing only the **final, approved, senior-architect-level guidelines** distilled from everything above.
This is not merged with your DAL spec. It is an **add-on document** you can place next to it (e.g., `DAL_Performance_And_AI_Guidelines.md`).
It contains:

* AI-agent execution rules
* Performance scalability rules
* Mandatory infra requirements
* Optional optimizations
* Clear “when to use what”

---

# **Data Access Layer – Final Guidelines (AI-Agent + Performance Edition)**

### *Standalone Addendum for Implementation, Scaling, and AI Automation*

This document supplements the main DAL Architecture Specification.
It defines **how the AI agent must execute the spec** and **the required performance/scalability rules** for production use with large datasets (600K–15M rows) and multi-schema / multi database environments.

---

# **1. AI AGENT EXECUTION RULES**

### **1.1. Purpose**

This document is a *control guide* for the AI agent.
It MUST NOT be copied into generated source files.

### **1.2. File creation rules**

* Only create/edit files at the **exact paths** specified in the main DAL spec.
* If a file already exists → **modify in place**.
  Never create duplicates (e.g., `customerRepository2.ts`).

### **1.3. Comment rules**

* In code, keep only:

  * Purpose comments,
  * Parameter docs,
  * Performance notes.
* Do NOT include:

  * “WAIT FOR APPROVAL”
  * Execution phases
  * Checklists
  * Orchestration instructions
  * Meta explanations

Production code must be clean, technical, and minimal.

### **1.4. Orchestration rules**

* “WAIT FOR APPROVAL”, “Phase 1/2/3”, “Next Action” are **orchestration markers** only.
* The AI agent MUST NOT:

  * Copy these to code files
  * Implement logic related to “approval”
  * Interpret these phrases literally

Phase transitions are decided by the orchestration layer or human operator.

### **1.5. Idempotence**

* Before writing, always check if file exists.
  If yes: **update**, don’t recreate.
* Never generate multiple versions of the same query or repository.

### **1.6. SQL file handling**

* Keep SQL files pure `.sql`.
* Must include:

  * Purpose
  * Parameters
  * Index requirements / performance expectations
* No process or orchestration comments.
* Use only approved placeholders (`{{SCHEMA_PRIMARY}}`, etc.).

### **1.7. TypeScript file handling**

* Follow naming conventions strictly.
* Keep only minimal comments describing responsibility.
* Ensure imports resolve correctly in the repo structure.
* Ensure all generated TS passes type checking.

---

# **2. REQUIRED PERFORMANCE & SCALABILITY RULES (MANDATORY)**

These MUST be implemented before production.

---

## **2.1. Pagination Strategy**

### **Rule A — Offset Pagination is Allowed BUT Only for Shallow Pages**

Offset-based pagination (`OFFSET n ROWS`) is allowed only when:

* Users typically view the first few pages only (e.g., 1–10)
* Table size < 1M **or**
* Indexes align with the ORDER BY columns

### **Rule B — Keyset Pagination for Large / Deep Lists**

Use **keyset (cursor) pagination** for large tables or deep navigation:

```
WHERE (@lastSeenId IS NULL OR id > @lastSeenId)
ORDER BY id
FETCH NEXT @limit ROWS ONLY;
```

Use cases:

* Tables > 1M rows
* Infinite scroll
* Drill-down lists where users can scroll deeply

### **AI-Agent Rule:**

*Do not auto-convert all queries to keyset; only those explicitly marked “large set” or “deep paging”.*

---

## **2.2. COUNT(*) Strategy**

Exact `COUNT(*)` is allowed only when:

* A supporting index exists on the WHERE filters
* Estimated execution time < 300ms

### Alternatives:

* **Approximate count** using `sys.partitions`
* **No count** (infinite scroll/“Load more” UX)
* **Precomputed/materialized counts** (later optimization)

### **UI Rule:**

The UI is allowed to omit “Page X of Y”. “Load More” is acceptable.

---

## **2.3. Cross-Database Join Rules**

### **Rule A — If schemas live in the SAME Azure SQL database**

Cross-schema joins are allowed.

### **Rule B — If schemas are on DIFFERENT databases or servers**

Cross-database joins are **forbidden for large result sets**.

Use one of:

* Data consolidation (both schemas into same DB)
* Data replication into primary DB
* Application-level join for small cardinalities only

### **AI-Agent Rule:**

Before generating cross-schema queries, verify whether schemas share the same DB (explicit in config).

---

## **2.4. SqlClient Connection Pool Configuration**

A single shared pool MUST be used:

```ts
pool: {
  max: 50,
  min: 5,
  idleTimeoutMillis: 30000
},
connectionTimeout: 15000,
requestTimeout: 30000
```

Tier-specific limits apply (Azure SQL Basic allows ~30 connections).

---

## **2.5. Transient Fault Handling (Azure SQL)**

All DB calls MUST include retry logic for transient failures:

Retry errors include:

* ECONNRESET
* ETIMEDOUT
* ENOTFOUND
* Azure SQL 40613 (DB unavailable)
* Azure SQL 49918/49919/49920 (throttling)

Strategy:

* 3 retries
* Exponential backoff (1s, 2s, 4s)

---

## **2.6. Query Monitoring (Mandatory)**

All queries must be wrapped to:

* Capture execution duration
* Log slow queries (> 1s)
* Capture parameters (redacted)
* Send telemetry to Application Insights

Purpose:

* Catch regressions
* Identify missing indexes
* Control Azure SQL cost

### **AI-Agent Rule:**

Always wrap queries with monitoring — NEVER write a “raw” pool.query call.

---

# **3. OPTIONAL BUT HIGH-VALUE OPTIMIZATIONS (POST-MVP)**

These are not mandatory for initial release but recommended for scale.

---

## **3.1. Result Caching (Redis)**

Use caching when:

* Data changes rarely (historical/ERP archive)
* Drill-down back/forward navigation is heavy
* Many users hit the same queries

Pattern:

* TTL-based caching (5–15 min)
* Cache only at service layer, not inside repositories

Approximate cost:

* Azure Redis Basic: $15–50/month
* Reduces SQL DTU use by 60–90%

---

## **3.2. Async Query Loading**

Switching from `readFileSync` → async parallel loading can speed startup slightly, but is optional.

Implement only when startup latency requirements are strict.

---

## **3.3. Materialized Views**

Use when:

* There are heavy GROUP BY aggregations
* Query plans repeatedly show expensive scans

Usually part of Phase 2 or scaling work.

---

## **3.4. Query Versioning Strategy**

Useful for zero-downtime deployments and backward compatibility:

Use:

```
queries/v1/list.sql
queries/v2/list.sql
```

Switch via environment variable.

---

# **4. DECISION MATRIX (Summary)**

| Topic                 | Allowed        | Required             | Optional         | Notes                      |
| --------------------- | -------------- | -------------------- | ---------------- | -------------------------- |
| Offset pagination     | Yes            | No                   | Yes              | Only for shallow pages     |
| Keyset pagination     | Yes            | Yes (for large/deep) | No               | Mandatory for heavy tables |
| COUNT(*) exact        | Yes            | Sometimes            | –                | Only when indexed + fast   |
| Approximate count     | Yes            | No                   | Yes              | Good alternative           |
| Redis caching         | Yes            | No                   | Yes              | Enable per endpoint        |
| Cross-schema joins    | Yes            | If same DB           | –                | Normal use                 |
| Cross-database joins  | No (for large) | –                    | Yes (small sets) | Must evaluate topology     |
| SqlClient pool config | –              | Yes                  | –                | Required                   |
| Retry logic           | –              | Yes                  | –                | Required                   |
| Query monitoring      | –              | Yes                  | –                | Required                   |
| Async loadQuery       | –              | No                   | Yes              | Performance nicety         |

---

# **5. FINAL RULE FOR THE AGENT**

> **When generating code, always follow the DAL main spec.
> This addendum defines *how to implement it safely at scale*, NOT what files to create.
> Apply mandatory sections automatically.
> Apply optional sections only when explicitly instructed.**

---

If you want, I can also create a **separate “AI Agent Quick Reference” version** (1 page, bullet-only, no explanations) that the agent can load extremely fast.


## **2.4. SqlClient Connection Pool Configuration**

A single shared pool MUST be used:

```ts
pool: {
  max: 50,
  min: 5,
  idleTimeoutMillis: 30000
},
connectionTimeout: 15000,
requestTimeout: 30000
```

Tier-specific limits apply (Azure SQL Basic allows ~30 connections).

---

## **2.5. Transient Fault Handling (Azure SQL)**

All DB calls MUST include retry logic for transient failures:

Retry errors include:

* ECONNRESET
* ETIMEDOUT
* ENOTFOUND
* Azure SQL 40613 (DB unavailable)
* Azure SQL 49918/49919/49920 (throttling)

Strategy:

* 3 retries
* Exponential backoff (1s, 2s, 4s)

---

## **2.6. Query Monitoring (Mandatory)**

All queries must be wrapped to:

* Capture execution duration
* Log slow queries (> 1s)
* Capture parameters (redacted)
* Send telemetry to Application Insights

Purpose:

* Catch regressions
* Identify missing indexes
* Control Azure SQL cost

### **AI-Agent Rule:**

Always wrap queries with monitoring — NEVER write a “raw” pool.query call.

---

# **3. OPTIONAL BUT HIGH-VALUE OPTIMIZATIONS (POST-MVP)**

These are not mandatory for initial release but recommended for scale.

---

## **3.1. Result Caching (Redis)**

Use caching when:

* Data changes rarely (historical/ERP archive)
* Drill-down back/forward navigation is heavy
* Many users hit the same queries

Pattern:

* TTL-based caching (5–15 min)
* Cache only at service layer, not inside repositories

Approximate cost:

* Azure Redis Basic: $15–50/month
* Reduces SQL DTU use by 60–90%

---

## **3.2. Async Query Loading**

Switching from `readFileSync` → async parallel loading can speed startup slightly, but is optional.

Implement only when startup latency requirements are strict.

---

## **3.3. Materialized Views**

Use when:

* There are heavy GROUP BY aggregations
* Query plans repeatedly show expensive scans

Usually part of Phase 2 or scaling work.

---

## **3.4. Query Versioning Strategy**

Useful for zero-downtime deployments and backward compatibility:

Use:

```
queries/v1/list.sql
queries/v2/list.sql
```

Switch via environment variable.

---

# **4. DECISION MATRIX (Summary)**

| Topic                 | Allowed        | Required             | Optional         | Notes                      |
| --------------------- | -------------- | -------------------- | ---------------- | -------------------------- |
| Offset pagination     | Yes            | No                   | Yes              | Only for shallow pages     |
| Keyset pagination     | Yes            | Yes (for large/deep) | No               | Mandatory for heavy tables |
| COUNT(*) exact        | Yes            | Sometimes            | –                | Only when indexed + fast   |
| Approximate count     | Yes            | No                   | Yes              | Good alternative           |
| Redis caching         | Yes            | No                   | Yes              | Enable per endpoint        |
| Cross-schema joins    | Yes            | If same DB           | –                | Normal use                 |
| Cross-database joins  | No (for large) | –                    | Yes (small sets) | Must evaluate topology     |
| SqlClient pool config | –              | Yes                  | –                | Required                   |
| Retry logic           | –              | Yes                  | –                | Required                   |
| Query monitoring      | –              | Yes                  | –                | Required                   |
| Async loadQuery       | –              | No                   | Yes              | Performance nicety         |

---

# **5. FINAL RULE FOR THE AGENT**

> **When generating code, always follow the DAL main spec.
> This addendum defines *how to implement it safely at scale*, NOT what files to create.
> Apply mandatory sections after approval.
> Apply optional sections only when explicitly instructed.**

---
