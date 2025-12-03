# The latest prompt:
@01_requirements/01_context/context.md How to extract the currect inline SQL Queries into a separate module where only SQL queries live and only results are managed in the ts code

# SQL Query Extraction Strategy

**Document Purpose:** Evaluate and select the best approach for extracting inline SQL queries into a dedicated module, separating query definitions from TypeScript business logic.

**Date Created:** December 2, 2025

---

## Current State Analysis

### Existing Structure
- SQL queries are defined as string constants within repository files (e.g., `customerRepository.ts`)
- Schema name hardcoded as constant (`const SCHEMA = 'M3FDBPRD'`)
- Queries use template literals with schema interpolation
- TypeScript code handles both query definition and result processing in the same file

### Example Current Implementation

```typescript
// In customerRepository.ts
const SCHEMA = 'M3FDBPRD';

const CUSTOMER_COUNT_QUERY = `
SELECT COUNT(*) AS total
FROM ${SCHEMA}.OCUSMA AS cus
WHERE (@customerNumber IS NULL OR cus.OKCUNO = @customerNumber)
  AND (@namePattern IS NULL OR cus.OKCUNM LIKE @namePattern)
  AND (@phone IS NULL OR cus.OKPHNO = @phone);
`;

// Business logic that uses the query
export class CustomerRepository {
  async search(criteria: CustomerSearchCriteria): Promise<CustomerSearchResult> {
    const rows = await client.query<CustomerRow>(CUSTOMER_COUNT_QUERY, parameters);
    // ... result processing
  }
}
```

### Problem Statement
- SQL queries mixed with TypeScript business logic
- Difficult for DBAs to review and optimize queries
- Harder to maintain SQL as database grows (3693 tables, ~74M records)
- Less optimal for security audits (Azure production requirements)
- Not AI-friendly for SQL-specific analysis and optimization

---

## Option 1: Dedicated Query Module per Feature

### Structure
```
api/src/features/customers/
  ├── customerRepository.ts      (business logic + result mapping)
  ├── customerQueries.ts         (SQL queries only)
  └── customerTypes.ts           (shared types)
```

### Implementation Pattern
```typescript
// customerQueries.ts
export const SCHEMA = 'M3FDBPRD';

export const CustomerQueries = {
  COUNT: `
    SELECT COUNT(*) AS total
    FROM ${SCHEMA}.OCUSMA AS cus
    WHERE (@customerNumber IS NULL OR cus.OKCUNO = @customerNumber)
      AND (@namePattern IS NULL OR cus.OKCUNM LIKE @namePattern)
      AND (@phone IS NULL OR cus.OKPHNO = @phone);
  `,
  
  SEARCH: `
    WITH CustomerOrders AS (...)
    SELECT cus.OKCUNO AS customerNumber, ...
    FROM ${SCHEMA}.OCUSMA AS cus
    ...
  `
};

// customerRepository.ts
import { CustomerQueries } from './customerQueries';

export class CustomerRepository {
  async search(criteria: CustomerSearchCriteria) {
    const rows = await client.query<CustomerRow>(
      CustomerQueries.SEARCH,
      parameters
    );
    return this.mapResults(rows);
  }
}
```

### Pros
✅ **Colocation:** Queries stay near the feature they serve  
✅ **Easy to find:** Feature-specific queries are in predictable location  
✅ **Clear separation:** Queries in one file, logic in another  
✅ **Simple migration:** Minimal refactoring from current structure  
✅ **Feature ownership:** Each feature owns its queries (supports future microservices)  
✅ **Focused changes:** Changes to customer queries don't touch other features  

### Cons
❌ **Query duplication:** Shared queries across features require duplication or separate pattern  
❌ **Schema repetition:** Schema configuration repeated per feature  
❌ **Standards enforcement:** Harder to enforce query conventions globally  
❌ **No central overview:** Can't see all database access patterns in one place  

### Best For
- Applications with clear feature boundaries
- Teams organized by feature domains
- When queries rarely span multiple features
- Smaller to medium-sized database schemas

---

## Option 2: Centralized Query Repository (RECOMMENDED)

### Structure
```
api/src/infrastructure/queries/
  ├── index.ts                   (query registry/export hub)
  ├── config.ts                  (schema, common query settings)
  ├── customers/
  │   └── customerQueries.ts     (customer SQL)
  ├── suppliers/
  │   └── supplierQueries.ts     (supplier SQL)
  ├── orders/
  │   └── orderQueries.ts        (order SQL)
  └── shared/
      └── commonQueries.ts       (reusable query fragments)

api/src/features/customers/
  └── customerRepository.ts      (imports from queries/, handles results)
```

### Implementation Pattern
```typescript
// infrastructure/queries/config.ts
export const QueryConfig = {
  schema: 'M3FDBPRD',
  timeout: 30000,
  maxRetries: 3
};

// infrastructure/queries/customers/customerQueries.ts
import { QueryConfig } from '../config';

const SCHEMA = QueryConfig.schema;

/**
 * Customer count query for search pagination
 * @param customerNumber - Optional exact customer number match
 * @param namePattern - Optional customer name pattern (LIKE)
 * @param phone - Optional phone number match
 */
export const CUSTOMER_COUNT_QUERY = `
SELECT COUNT(*) AS total
FROM ${SCHEMA}.OCUSMA AS cus
WHERE (@customerNumber IS NULL OR cus.OKCUNO = @customerNumber)
  AND (@namePattern IS NULL OR cus.OKCUNM LIKE @namePattern)
  AND (@phone IS NULL OR cus.OKPHNO = @phone);
`;

/**
 * Customer search with order aggregation
 * Includes recent orders as JSON for efficiency
 * @performance Optimized for large datasets (74M+ records)
 */
export const CUSTOMER_SEARCH_QUERY = `
WITH CustomerOrders AS (
  SELECT
    head.OACUNO AS CustomerNumber,
    COUNT(DISTINCT head.OAORNO) AS OrderCount,
    MAX(head.OAORDT) AS LatestOrderDate
  FROM ${SCHEMA}.OOHEAD AS head
  GROUP BY head.OACUNO
)
SELECT
  cus.OKCUNO AS customerNumber,
  cus.OKCUNM AS customerName,
  ...
`;

// infrastructure/queries/index.ts
export * from './customers/customerQueries';
export * from './suppliers/supplierQueries';
export * from './config';

// features/customers/customerRepository.ts
import { CUSTOMER_COUNT_QUERY, CUSTOMER_SEARCH_QUERY } from '../../infrastructure/queries';

export class CustomerRepository {
  async search(criteria: CustomerSearchCriteria) {
    const [{ total }] = await client.query(CUSTOMER_COUNT_QUERY, params);
    const rows = await client.query(CUSTOMER_SEARCH_QUERY, params);
    return this.mapResults(rows, total);
  }
  
  private mapResults(rows: CustomerRow[], total: number) {
    // Pure TypeScript result mapping logic
  }
}
```

### Pros
✅ **Single source of truth:** All SQL in one location  
✅ **Centralized configuration:** Schema, timeouts, common settings managed once  
✅ **Global optimization:** Apply performance improvements across all queries  
✅ **Database migration friendly:** Clear audit trail for DB2 → Azure SQL migration  
✅ **Standards enforcement:** Easier to implement query conventions  
✅ **Security audits:** Single point for reviewing all database access  
✅ **DBA collaboration:** DBAs can navigate SQL without diving into business logic  
✅ **Query reuse:** Shared queries across features without duplication  
✅ **Documentation:** Can add comprehensive SQL comments and performance notes  
✅ **AI-friendly:** Centralized structure for AI analysis and optimization  
✅ **Maintainability:** New team members find all SQL in predictable location (ISO 25010)  

### Cons
❌ **Physical separation:** Queries separate from business logic (less cohesion)  
❌ **Navigation overhead:** Requires switching between folders during development  
❌ **"God module" risk:** Can become large as app grows (mitigated by subfolders)  
❌ **Import paths:** Slightly longer import statements  

### Best For
- Large database schemas (✅ 3693 tables in this project)
- High-volume data (✅ 74M+ records)
- Production applications requiring security audits (✅ Azure production)
- Migration projects needing audit trails (✅ DB2 → Azure SQL)
- Teams with dedicated DBAs
- Applications prioritizing maintainability and documentation

### Why Recommended for This Project

1. **Migration Context:** With 3693 tables and DB2 → Azure SQL migration, centralized queries provide clear audit trail
2. **Scale:** 74M records require performance optimization - centralization helps identify bottlenecks
3. **Security:** Azure production requirements benefit from single SQL review point
4. **Maintainability:** Aligns with context.md rule 22 (highly maintainable for new team members)
5. **Documentation:** Production code requirement (rule 11) - centralized SQL easier to document
6. **AI-friendly:** Aligns with rule 29 - clear structure for AI analysis

---

## Option 3: Hybrid Approach - Query Builders with Type Safety

### Structure
```
api/src/infrastructure/queries/
  ├── queryBuilder.ts            (parameterized query construction)
  ├── schema.ts                  (schema constants & table metadata)
  └── types.ts                   (query parameter types)

api/src/features/customers/
  ├── customerRepository.ts      (uses query builder)
  └── customerQueries.ts         (query definitions using builder)
```

### Implementation Pattern
```typescript
// infrastructure/queries/queryBuilder.ts
export class QueryBuilder {
  constructor(private schema: string) {}
  
  select(table: string, columns: string[]) {
    return new SelectBuilder(this.schema, table, columns);
  }
}

class SelectBuilder {
  where(conditions: WhereCondition[]) { ... }
  join(table: string, on: string) { ... }
  build(): { sql: string; params: Record<string, unknown> } { ... }
}

// features/customers/customerQueries.ts
import { QueryBuilder } from '../../infrastructure/queries/queryBuilder';

const qb = new QueryBuilder('M3FDBPRD');

export const buildCustomerSearchQuery = (criteria: SearchCriteria) => {
  return qb
    .select('OCUSMA', ['OKCUNO', 'OKCUNM', 'OKPHNO'])
    .where([
      { column: 'OKCUNO', operator: '=', value: criteria.customerNumber, optional: true },
      { column: 'OKCUNM', operator: 'LIKE', value: criteria.namePattern, optional: true }
    ])
    .orderBy('OKCUNM')
    .paginate(criteria.offset, criteria.limit)
    .build();
};

// features/customers/customerRepository.ts
export class CustomerRepository {
  async search(criteria: CustomerSearchCriteria) {
    const { sql, params } = buildCustomerSearchQuery(criteria);
    const rows = await client.query<CustomerRow>(sql, params);
    return this.mapResults(rows);
  }
}
```

### Pros
✅ **Type safety:** Compile-time checking of query parameters  
✅ **Reusability:** Common query patterns abstracted  
✅ **IDE support:** Better autocomplete and refactoring  
✅ **Dynamic queries:** Build queries based on runtime criteria  
✅ **Validation:** Parameter validation built into builder  
✅ **Testing:** Easier to unit test query construction  

### Cons
❌ **Complexity:** Significant upfront investment in builder infrastructure  
❌ **Learning curve:** Team needs to learn builder API  
❌ **Raw SQL hidden:** Harder for DBAs to review actual SQL  
❌ **Over-engineering:** May be overkill for straightforward queries  
❌ **Debugging:** Generated SQL harder to inspect and debug  
❌ **Performance tuning:** Less control over query optimization  

### Best For
- Applications with highly dynamic queries
- Teams with strong TypeScript expertise
- Projects with many similar query patterns
- When compile-time safety is critical

---

## Option 4: SQL Files with Runtime Loader

### Structure
```
api/src/infrastructure/queries/
  ├── sql/
  │   ├── customers/
  │   │   ├── search-count.sql
  │   │   ├── search-data.sql
  │   │   └── get-by-number.sql
  │   ├── suppliers/
  │   │   └── ...
  │   └── orders/
  │       └── ...
  ├── loader/
  │   ├── queryLoader.ts         (loads .sql files at runtime)
  │   └── queryCache.ts          (caches loaded queries)
  └── queryRegistry.ts           (typed query access)
```

### Implementation Pattern
```sql
-- sql/customers/search-count.sql
/**
 * Count customers matching search criteria
 * @param customerNumber - Optional exact customer number
 * @param namePattern - Optional name pattern (use % wildcards)
 * @param phone - Optional phone number
 */
SELECT COUNT(*) AS total
FROM {{SCHEMA}}.OCUSMA AS cus
WHERE (@customerNumber IS NULL OR cus.OKCUNO = @customerNumber)
  AND (@namePattern IS NULL OR cus.OKCUNM LIKE @namePattern)
  AND (@phone IS NULL OR cus.OKPHNO = @phone);
```

```typescript
// infrastructure/queries/loader/queryLoader.ts
import { readFileSync } from 'fs';
import { join } from 'path';

export class QueryLoader {
  private cache = new Map<string, string>();
  
  load(category: string, queryName: string, config: QueryConfig): string {
    const key = `${category}/${queryName}`;
    
    if (!this.cache.has(key)) {
      const path = join(__dirname, '../sql', `${key}.sql`);
      const template = readFileSync(path, 'utf-8');
      const sql = template.replace(/\{\{SCHEMA\}\}/g, config.schema);
      this.cache.set(key, sql);
    }
    
    return this.cache.get(key)!;
  }
}

// infrastructure/queries/queryRegistry.ts
const loader = new QueryLoader();

export const CustomerQueries = {
  COUNT: loader.load('customers', 'search-count', config),
  SEARCH: loader.load('customers', 'search-data', config)
};

// features/customers/customerRepository.ts
import { CustomerQueries } from '../../infrastructure/queries/queryRegistry';

export class CustomerRepository {
  async search(criteria: CustomerSearchCriteria) {
    const rows = await client.query(CustomerQueries.SEARCH, params);
    return this.mapResults(rows);
  }
}
```

### Pros
✅ **Pure SQL:** Native .sql files with full syntax highlighting  
✅ **DBA-friendly:** DBAs can work without TypeScript knowledge  
✅ **Tool support:** Use SQL linters, formatters, IDE plugins  
✅ **Direct execution:** Can copy-paste into SSMS or Azure Data Studio  
✅ **Version control:** SQL changes clearly visible in git diffs  
✅ **Comments:** Full SQL comments without TypeScript interference  
✅ **Separation:** Complete separation of SQL from code  

### Cons
❌ **Build complexity:** Requires file loading mechanism  
❌ **No compile-time check:** SQL errors only found at runtime  
❌ **Deployment:** Must include .sql files in deployment package  
❌ **Template variables:** Schema interpolation requires preprocessing  
❌ **Type safety:** Harder to ensure query/result type alignment  
❌ **Tooling:** Need custom tooling for query validation  

### Best For
- Teams with dedicated DBAs
- Projects with many complex SQL queries
- When SQL review by non-developers is frequent
- Organizations with SQL-first culture

---

## Comparison Matrix

| Criteria | Option 1 (Per-Feature) | Option 2 (Centralized) | Option 3 (Builder) | Option 4 (SQL Files) |
|----------|------------------------|------------------------|-------------------|---------------------|
| **Maintainability** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **DBA Friendliness** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Type Safety** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Migration Ease** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Query Reuse** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Security Audit** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **AI-Friendly** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Setup Complexity** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Performance** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Learning Curve** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |

---

## Recommendation: **UPDATED** - Option 1 (Per-Feature) or Hybrid

### How Updated Requirements Change the Recommendation

#### Original Assumption vs. Reality

| Factor | Original Assumption | Updated Reality | Impact on Recommendation |
|--------|---------------------|-----------------|--------------------------|
| **Table Count** | 3693 tables | ~50 significant tables | ✅ Reduces need for centralization |
| **Operations** | Full CRUD | Read-only | ✅ Simplifies security audit concerns |
| **Query Complexity** | Standard queries | Drilldown views, hierarchies | ✅ Favors feature-based organization |
| **Frontend Pattern** | Not specified | Master-detail, drilldowns | ✅ Queries should mirror UI structure |
| **Data Volume** | 74M records | 74M records | ⚠️ Still requires optimization |

#### Why This Changes Everything

**1. Read-Only Operations**
- No complex transaction management needed
- Security audit simpler (no data modification risks)
- Query organization can focus on retrieval patterns, not write safety
- Less critical to have centralized oversight

**2. Smaller Table Scope (~50 tables)**
- "God module" risk is minimal
- Easy to navigate even with centralized approach
- But also easy to manage with per-feature organization
- Finding queries is simple either way

**3. Drilldown Views & Frontend Hierarchy**
- Multiple related queries per feature (list → detail → drilldown)
- Queries work together as a set to support UI flow
- **Strong argument for colocation:** Keep customer list, customer detail, and customer order drilldown together
- Frontend developers need to see all queries for a feature in one place
- UI-driven development benefits from queries near the components that use them

**4. Multiple Queries Per Feature**
- Customer entity might have: `CUSTOMER_LIST`, `CUSTOMER_DETAIL`, `CUSTOMER_ORDERS`, `CUSTOMER_ORDER_ITEMS`
- These queries are conceptually related as part of the "customer feature"
- Per-feature organization groups related queries naturally

### Updated Recommendation: **Option 1 (Per-Feature)**

For this specific use case, **Option 1 (Per-Feature)** is now the better choice because:

✅ **UI Alignment:** Queries organized by frontend feature/view  
✅ **Developer Workflow:** Frontend devs work in one feature folder  
✅ **Related Query Grouping:** Drilldown queries stay together  
✅ **Manageable Scale:** 50 tables won't create sprawl  
✅ **Simpler Implementation:** Minimal refactoring from current state  
✅ **Read-Only Simplicity:** Less need for centralized oversight  

#### Adjusted Structure for Drilldown Support

```
api/src/features/customers/
  ├── customerRepository.ts       (business logic)
  ├── customerQueries.ts          (ALL customer-related SQL)
  │   ├── CUSTOMER_LIST_QUERY     (main list view)
  │   ├── CUSTOMER_DETAIL_QUERY   (detail view)
  │   ├── CUSTOMER_ORDERS_QUERY   (orders drilldown)
  │   └── ORDER_ITEMS_QUERY       (order items drilldown)
  └── customerTypes.ts            (types for all views)
```

#### Implementation Pattern for Drilldown Views

```typescript
// customerQueries.ts - Organized by UI hierarchy
import { QueryConfig } from '../../infrastructure/queries/config'; // Shared config

const SCHEMA = QueryConfig.schema;

/**
 * Customer List Query
 * Used by: Customer search/list page
 * Performance: Optimized for pagination with 74M records
 */
export const CUSTOMER_LIST_QUERY = `
SELECT 
  cus.OKCUNO AS customerNumber,
  cus.OKCUNM AS customerName,
  cus.OKPHNO AS phone,
  COUNT(DISTINCT ord.OAORNO) AS orderCount
FROM ${SCHEMA}.OCUSMA AS cus
LEFT JOIN ${SCHEMA}.OOHEAD AS ord ON ord.OACUNO = cus.OKCUNO
WHERE (@namePattern IS NULL OR cus.OKCUNM LIKE @namePattern)
GROUP BY cus.OKCUNO, cus.OKCUNM, cus.OKPHNO
ORDER BY cus.OKCUNM
OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
`;

/**
 * Customer Detail Query
 * Used by: Customer detail page (drill-in from list)
 * Returns: Full customer information with aggregated stats
 */
export const CUSTOMER_DETAIL_QUERY = `
SELECT 
  cus.OKCUNO AS customerNumber,
  cus.OKCUNM AS customerName,
  cus.OKPHNO AS phone,
  cus.OKVTCD AS vat,
  cus.OKADDR1 AS address1,
  cus.OKADDR2 AS address2,
  COUNT(DISTINCT ord.OAORNO) AS orderCount,
  SUM(ord.OATOAM) AS totalOrderValue,
  MAX(ord.OAORDT) AS latestOrderDate
FROM ${SCHEMA}.OCUSMA AS cus
LEFT JOIN ${SCHEMA}.OOHEAD AS ord ON ord.OACUNO = cus.OKCUNO
WHERE cus.OKCUNO = @customerNumber
GROUP BY cus.OKCUNO, cus.OKCUNM, cus.OKPHNO, cus.OKVTCD, cus.OKADDR1, cus.OKADDR2;
`;

/**
 * Customer Orders Query (Drilldown Level 1)
 * Used by: Customer detail page → Orders tab/section
 * Returns: All orders for a specific customer
 */
export const CUSTOMER_ORDERS_QUERY = `
SELECT 
  ord.OAORNO AS orderNumber,
  ord.OACUOR AS customerOrderNumber,
  ord.OAORDT AS orderDate,
  ord.OAORST AS orderStatus,
  COUNT(DISTINCT line.OBITNO) AS itemCount,
  SUM(line.OBORQT * line.OBNEPR) AS orderTotal
FROM ${SCHEMA}.OOHEAD AS ord
LEFT JOIN ${SCHEMA}.OOLINE AS line ON line.OBORNO = ord.OAORNO
WHERE ord.OACUNO = @customerNumber
GROUP BY ord.OAORNO, ord.OACUOR, ord.OAORDT, ord.OAORST
ORDER BY ord.OAORDT DESC
OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
`;

/**
 * Order Items Query (Drilldown Level 2)
 * Used by: Customer detail → Orders → Order items
 * Returns: Line items for a specific order
 */
export const ORDER_ITEMS_QUERY = `
SELECT 
  line.OBITNO AS itemNumber,
  line.OBITDS AS itemDescription,
  line.OBORQT AS quantity,
  line.OBNEPR AS unitPrice,
  line.OBORQT * line.OBNEPR AS lineTotal,
  prod.MMITDS AS productDescription,
  prod.MMUNMS AS unitOfMeasure
FROM ${SCHEMA}.OOLINE AS line
LEFT JOIN ${SCHEMA}.MITMAS AS prod ON prod.MMITNO = line.OBITNO
WHERE line.OBORNO = @orderNumber
ORDER BY line.OBPONR;
`;

// Query metadata for documentation
export const CustomerQueryMetadata = {
  LIST: { view: 'Customer List', tables: ['OCUSMA', 'OOHEAD'], type: 'list' },
  DETAIL: { view: 'Customer Detail', tables: ['OCUSMA', 'OOHEAD'], type: 'detail' },
  ORDERS: { view: 'Customer Orders Drilldown', tables: ['OOHEAD', 'OOLINE'], type: 'drilldown-1' },
  ORDER_ITEMS: { view: 'Order Items Drilldown', tables: ['OOLINE', 'MITMAS'], type: 'drilldown-2' }
};
```

### Rationale Based on **Updated** Project Context

#### Alignment with Project Requirements

**From context.md:**

1. **Production-ready code (Rule 0):** Per-feature maintains ISO 25010 with smaller scope ✅
2. **High-quality, readable, maintainable (Rule 9, 14):** Feature-based is maintainable with 50 tables ✅
3. **Well documented (Rule 11, 17, 22):** Documentation per feature is effective ✅
4. **AI-friendly (Rule 29):** Clear feature boundaries for AI analysis ✅
5. **Optimized queries (Quality Req 5):** Can still optimize within feature folders ✅
6. **Excellent UX (Quality Req 7):** Queries aligned with UI flow improves dev UX ✅

#### Updated Project-Specific Factors

1. **Scale:** 50 tables, 74M records → Feature organization sufficient
2. **Read-only:** Simpler security model → Less need for centralized audit
3. **Frontend-driven:** Drilldown views → Queries should match UI structure
4. **Team workflow:** Frontend devs → Keep queries near features they build
5. **Maintainability:** Small scope → Easy to find queries either way, prefer cohesion

### When to Still Use Centralized (Option 2)

Consider centralized approach if:
- ❌ Queries are reused across multiple features heavily
- ❌ Need strict DBA review process before deployment
- ❌ Multiple backend teams working on same features
- ❌ Compliance requires single SQL audit point

For your use case, these don't apply strongly enough to outweigh the benefits of per-feature organization.

### Implementation Phases (Updated for Per-Feature Approach)

#### Phase 1: Shared Infrastructure Setup
1. Create `api/src/infrastructure/queries/config.ts` (shared schema config only)
2. Document query naming conventions
3. Create query template/examples

#### Phase 2: Extract Customer Queries (Proof of Concept)
1. Create `api/src/features/customers/customerQueries.ts`
2. Extract existing SQL from `customerRepository.ts`
3. Organize queries by UI hierarchy (list → detail → drilldown)
4. Add JSDoc comments explaining which view uses each query
5. Update repository to import from `./customerQueries`
6. Test all customer views

#### Phase 3: Standards & Documentation
1. Document query organization pattern (list/detail/drilldown)
2. Create template for new features
3. Document performance optimization guidelines
4. Add query metadata for each feature

#### Phase 4: Expand to Other Features
1. Apply pattern to suppliers feature
2. Apply pattern to orders feature  
3. Apply pattern to manufacturing orders feature
4. Identify and extract any truly shared queries to `infrastructure/queries/shared/`

### Shared Configuration Pattern

Even with per-feature queries, share configuration centrally:

```typescript
// api/src/infrastructure/queries/config.ts
export const QueryConfig = {
  schema: 'M3FDBPRD',
  defaultPageSize: 25,
  maxPageSize: 100,
  timeout: 30000
} as const;

export type QueryConfig = typeof QueryConfig;
```

Each feature imports this config:

```typescript
// features/customers/customerQueries.ts
import { QueryConfig } from '../../infrastructure/queries/config';

const SCHEMA = QueryConfig.schema;
```

### Handling Shared Queries

If you find queries used by multiple features (rare in UI-driven apps), create:

```
api/src/infrastructure/queries/
  └── shared/
      └── commonFragments.ts   (Only truly shared SQL)
```

Example shared fragment:
```typescript
// For queries that join to products across multiple features
export const PRODUCT_JOIN_FRAGMENT = `
LEFT JOIN ${SCHEMA}.MITMAS AS prod 
  ON prod.MMITNO = @itemNumber
`;
```

---

## Alternative Consideration: Hybrid Approach

If after initial implementation of Option 2, we find:
- Need for more dynamic queries
- Type safety concerns
- DBA needs direct SQL file access

We can evolve to a **hybrid of Option 2 + Option 4**:
- Keep centralized structure
- Move complex queries to `.sql` files
- Keep simple queries as TypeScript constants
- Use query loader for `.sql` files only where needed

This provides flexibility without over-engineering from the start.

---

## Decision Required

Please review the options and indicate:
1. Which option to proceed with (recommended: Option 2)
2. Any modifications to the proposed structure
3. Priority entities to migrate first (e.g., customers, then suppliers, then orders)

Once decided, I will:
1. Explain exact implementation steps
2. Wait for approval
3. Generate the infrastructure code
4. Migrate existing customer queries as proof of concept
5. Create documentation and conventions

---

**Document Status:** Awaiting decision  
**Next Action:** User to select option and approve implementation approach

---
---

# UPDATED ANALYSIS: Read-Only with Drilldown Views

**Date Updated:** December 3, 2025  
**Updated Prompt:** "How will you change the recommendations if we only need to Read from the database, and the significant tables are few, let's say 50, not 3700 but we might need to be able to manage a number of queries, including drilldown views in the front-end"

## Updated Requirements Context

### Key Requirement Changes from Original Analysis:

| Factor | Original Assumption | **Updated Reality** | Impact |
|--------|---------------------|---------------------|--------|
| **Operations** | Full CRUD (Create/Read/Update/Delete) | **Read-only** | Major simplification |
| **Table Count** | 3693 tables across entire database | **~50 significant tables** | Reduces complexity significantly |
| **Query Patterns** | Standard list/detail queries | **Multiple queries with drilldown hierarchies** | Requires grouped organization |
| **Frontend Pattern** | Not specified | **Master-detail, drilldown views** | Queries should mirror UI structure |
| **Data Volume** | 74M records | **74M records** (unchanged) | Still requires optimization |

### What This Means:

1. **Read-Only = Simpler Security**
   - No transaction management needed
   - No risk of data modification
   - Security audit focuses only on data access patterns
   - Less critical to have centralized oversight for write operations

2. **50 Tables = Manageable Scale**
   - Won't create sprawling "god modules"
   - Easy to navigate with any organization pattern
   - Finding queries is simple regardless of structure
   - "Scale" is no longer a deciding factor

3. **Drilldown Views = Related Query Sets**
   - Queries work together to support UI flows
   - Example: Customer List → Customer Detail → Customer Orders → Order Items
   - These related queries should be grouped together
   - Frontend developers need to see the full query hierarchy for a feature

4. **Multiple Queries Per Feature**
   - Each entity (Customer, Supplier, Order) has multiple views
   - Views are hierarchically related (parent → child → grandchild)
   - Queries are conceptually part of the same "feature"

---

## Updated Recommendation: Option 1 (Per-Feature) is Now Preferred

### Why the Recommendation Changes

With the updated requirements, **Option 1 (Per-Feature Query Module)** becomes the better choice because:

#### Strong Arguments FOR Per-Feature:
✅ **UI Alignment:** Drilldown queries naturally group by feature  
✅ **Developer Workflow:** Frontend devs work in one folder for a complete feature  
✅ **Related Query Cohesion:** List/detail/drilldown queries stay together  
✅ **Manageable Scale:** 50 tables won't create maintenance issues  
✅ **Simpler Refactoring:** Minimal changes from current structure  
✅ **Feature Encapsulation:** Each feature owns its complete query set  

#### Arguments AGAINST Centralization (that were strong before):
❌ ~~Large table count~~ → Only 50 tables now  
❌ ~~Complex write operations~~ → Read-only now  
❌ ~~Need for transaction oversight~~ → No writes, not applicable  
❌ ~~DBA review of modifications~~ → Simpler with read-only  

### Updated Structure for Drilldown Support

```
api/src/features/
  ├── customers/
  │   ├── customerRepository.ts       (business logic, result mapping)
  │   ├── customerQueries.ts          (ALL customer SQL - organized by view hierarchy)
  │   │   ├── CUSTOMER_LIST_QUERY     (main list view)
  │   │   ├── CUSTOMER_DETAIL_QUERY   (detail view when clicking a customer)
  │   │   ├── CUSTOMER_ORDERS_QUERY   (orders drilldown - level 1)
  │   │   └── ORDER_ITEMS_QUERY       (order items drilldown - level 2)
  │   └── customerTypes.ts            (types for all views)
  │
  ├── suppliers/
  │   ├── supplierRepository.ts
  │   ├── supplierQueries.ts          (ALL supplier SQL)
  │   │   ├── SUPPLIER_LIST_QUERY
  │   │   ├── SUPPLIER_DETAIL_QUERY
  │   │   └── SUPPLIER_PRODUCTS_QUERY
  │   └── supplierTypes.ts
  │
  └── orders/
      ├── orderRepository.ts
      ├── orderQueries.ts              (ALL order SQL)
      │   ├── ORDER_LIST_QUERY
      │   ├── ORDER_DETAIL_QUERY
      │   ├── ORDER_LINES_QUERY
      │   └── ORDER_SHIPMENTS_QUERY
      └── orderTypes.ts

api/src/infrastructure/queries/
  ├── config.ts                        (shared schema config, common settings)
  └── shared/                          (only if truly shared queries emerge)
      └── commonFragments.ts
```

---

## Implementation Pattern for Drilldown Views

### Example: Customer Feature with Complete Drilldown Hierarchy

```typescript
// api/src/features/customers/customerQueries.ts
import { QueryConfig } from '../../infrastructure/queries/config';

const SCHEMA = QueryConfig.schema;

/**
 * ==========================================
 * CUSTOMER LIST VIEW (Level 0 - Entry Point)
 * ==========================================
 * Used by: /customers page - main list view
 * Returns: Paginated customer list with basic info
 * Performance: Optimized for 74M+ records with proper indexing
 * UI Flow: User sees this first, clicks row to drill into detail
 */
export const CUSTOMER_LIST_QUERY = `
SELECT 
  cus.OKCUNO AS customerNumber,
  cus.OKCUNM AS customerName,
  cus.OKPHNO AS phone,
  COUNT(DISTINCT ord.OAORNO) AS orderCount
FROM ${SCHEMA}.OCUSMA AS cus
LEFT JOIN ${SCHEMA}.OOHEAD AS ord ON ord.OACUNO = cus.OKCUNO
WHERE (@namePattern IS NULL OR cus.OKCUNM LIKE @namePattern)
  AND (@customerNumber IS NULL OR cus.OKCUNO = @customerNumber)
  AND (@phone IS NULL OR cus.OKPHNO = @phone)
GROUP BY cus.OKCUNO, cus.OKCUNM, cus.OKPHNO
ORDER BY cus.OKCUNM
OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
`;

/**
 * ==========================================
 * CUSTOMER COUNT (Pagination Support)
 * ==========================================
 * Used by: /customers page - for total count
 * Returns: Total matching customers for pagination
 */
export const CUSTOMER_COUNT_QUERY = `
SELECT COUNT(*) AS total
FROM ${SCHEMA}.OCUSMA AS cus
WHERE (@namePattern IS NULL OR cus.OKCUNM LIKE @namePattern)
  AND (@customerNumber IS NULL OR cus.OKCUNO = @customerNumber)
  AND (@phone IS NULL OR cus.OKPHNO = @phone);
`;

/**
 * ==========================================
 * CUSTOMER DETAIL VIEW (Level 1 - Drilldown)
 * ==========================================
 * Used by: /customers/:id page - detailed view after clicking list item
 * Returns: Complete customer information with aggregated statistics
 * UI Flow: User clicked a customer from list, sees full details here
 * Next: User can click "Orders" tab to drill into CUSTOMER_ORDERS_QUERY
 */
export const CUSTOMER_DETAIL_QUERY = `
SELECT 
  cus.OKCUNO AS customerNumber,
  cus.OKCUNM AS customerName,
  cus.OKPHNO AS phone,
  cus.OKVTCD AS vat,
  cus.OKADDR1 AS address1,
  cus.OKADDR2 AS address2,
  cus.OKCITY AS city,
  cus.OKPONO AS postalCode,
  cus.OKCOUN AS country,
  COUNT(DISTINCT ord.OAORNO) AS orderCount,
  SUM(ord.OATOAM) AS totalOrderValue,
  MAX(ord.OAORDT) AS latestOrderDate,
  MIN(ord.OAORDT) AS firstOrderDate
FROM ${SCHEMA}.OCUSMA AS cus
LEFT JOIN ${SCHEMA}.OOHEAD AS ord ON ord.OACUNO = cus.OKCUNO
WHERE cus.OKCUNO = @customerNumber
GROUP BY cus.OKCUNO, cus.OKCUNM, cus.OKPHNO, cus.OKVTCD, 
         cus.OKADDR1, cus.OKADDR2, cus.OKCITY, cus.OKPONO, cus.OKCOUN;
`;

/**
 * ==========================================
 * CUSTOMER ORDERS (Level 2 - Drilldown)
 * ==========================================
 * Used by: /customers/:id page - Orders tab/section
 * Returns: All orders for the selected customer
 * UI Flow: User is viewing customer detail, clicks "Orders" tab
 * Next: User can click an order to drill into ORDER_ITEMS_QUERY
 */
export const CUSTOMER_ORDERS_QUERY = `
SELECT 
  ord.OAORNO AS orderNumber,
  ord.OACUOR AS customerOrderNumber,
  ord.OAORDT AS orderDate,
  ord.OAORST AS orderStatus,
  ord.OADWDT AS deliveryDate,
  COUNT(DISTINCT line.OBITNO) AS itemCount,
  SUM(line.OBORQT * line.OBNEPR) AS orderTotal
FROM ${SCHEMA}.OOHEAD AS ord
LEFT JOIN ${SCHEMA}.OOLINE AS line ON line.OBORNO = ord.OAORNO
WHERE ord.OACUNO = @customerNumber
GROUP BY ord.OAORNO, ord.OACUOR, ord.OAORDT, ord.OAORST, ord.OADWDT
ORDER BY ord.OAORDT DESC
OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
`;

/**
 * ==========================================
 * ORDER ITEMS (Level 3 - Deep Drilldown)
 * ==========================================
 * Used by: /customers/:id page - Order detail expansion/modal
 * Returns: Line items for a specific order
 * UI Flow: User clicked an order from the orders list, sees line items
 * This is the deepest level in the customer feature hierarchy
 */
export const ORDER_ITEMS_QUERY = `
SELECT 
  line.OBITNO AS itemNumber,
  line.OBITDS AS itemDescription,
  line.OBORQT AS quantity,
  line.OBNEPR AS unitPrice,
  line.OBORQT * line.OBNEPR AS lineTotal,
  line.OBWHLO AS warehouse,
  prod.MMITDS AS productDescription,
  prod.MMUNMS AS unitOfMeasure,
  prod.MMITCL AS productClass
FROM ${SCHEMA}.OOLINE AS line
LEFT JOIN ${SCHEMA}.MITMAS AS prod ON prod.MMITNO = line.OBITNO
WHERE line.OBORNO = @orderNumber
ORDER BY line.OBPONR;
`;

/**
 * ==========================================
 * QUERY METADATA (Documentation)
 * ==========================================
 * Helps developers understand the query hierarchy and relationships
 */
export const CustomerQueryMetadata = {
  CUSTOMER_LIST: {
    view: 'Customer List',
    level: 0,
    route: '/customers',
    tables: ['OCUSMA', 'OOHEAD'],
    nextDrilldown: 'CUSTOMER_DETAIL'
  },
  CUSTOMER_COUNT: {
    view: 'Customer List Pagination',
    level: 0,
    route: '/customers',
    tables: ['OCUSMA'],
    purpose: 'Count for pagination'
  },
  CUSTOMER_DETAIL: {
    view: 'Customer Detail',
    level: 1,
    route: '/customers/:id',
    tables: ['OCUSMA', 'OOHEAD'],
    previousView: 'CUSTOMER_LIST',
    nextDrilldown: 'CUSTOMER_ORDERS'
  },
  CUSTOMER_ORDERS: {
    view: 'Customer Orders',
    level: 2,
    route: '/customers/:id (Orders tab)',
    tables: ['OOHEAD', 'OOLINE'],
    previousView: 'CUSTOMER_DETAIL',
    nextDrilldown: 'ORDER_ITEMS'
  },
  ORDER_ITEMS: {
    view: 'Order Line Items',
    level: 3,
    route: '/customers/:id (Order detail)',
    tables: ['OOLINE', 'MITMAS'],
    previousView: 'CUSTOMER_ORDERS',
    nextDrilldown: null
  }
};
```

### Repository Implementation

```typescript
// api/src/features/customers/customerRepository.ts
import { SqlClient } from '../../infrastructure/sqlClient';
import {
  CUSTOMER_LIST_QUERY,
  CUSTOMER_COUNT_QUERY,
  CUSTOMER_DETAIL_QUERY,
  CUSTOMER_ORDERS_QUERY,
  ORDER_ITEMS_QUERY
} from './customerQueries';
import { 
  CustomerListItem, 
  CustomerDetail, 
  CustomerOrder, 
  OrderItem 
} from './customerTypes';

export class CustomerRepository {
  constructor(private readonly clientFactory: () => Promise<SqlClient>) {}

  /**
   * Get paginated customer list (Level 0)
   */
  async searchCustomers(criteria: {
    namePattern?: string;
    customerNumber?: string;
    phone?: string;
    limit: number;
    offset: number;
  }) {
    const client = await this.clientFactory();
    
    const params = {
      namePattern: criteria.namePattern ? `%${criteria.namePattern}%` : null,
      customerNumber: criteria.customerNumber ?? null,
      phone: criteria.phone ?? null,
      limit: criteria.limit,
      offset: criteria.offset
    };

    const [{ total = 0 } = { total: 0 }] = await client.query<{ total: number }>(
      CUSTOMER_COUNT_QUERY,
      params
    );

    const rows = await client.query<CustomerListItem>(CUSTOMER_LIST_QUERY, params);

    return { total, customers: rows };
  }

  /**
   * Get customer detail (Level 1)
   */
  async getCustomerDetail(customerNumber: string): Promise<CustomerDetail | null> {
    const client = await this.clientFactory();
    const [detail] = await client.query<CustomerDetail>(
      CUSTOMER_DETAIL_QUERY,
      { customerNumber }
    );
    return detail ?? null;
  }

  /**
   * Get customer orders (Level 2 drilldown)
   */
  async getCustomerOrders(
    customerNumber: string,
    limit: number = 25,
    offset: number = 0
  ) {
    const client = await this.clientFactory();
    const orders = await client.query<CustomerOrder>(
      CUSTOMER_ORDERS_QUERY,
      { customerNumber, limit, offset }
    );
    return orders;
  }

  /**
   * Get order items (Level 3 drilldown)
   */
  async getOrderItems(orderNumber: string) {
    const client = await this.clientFactory();
    const items = await client.query<OrderItem>(
      ORDER_ITEMS_QUERY,
      { orderNumber }
    );
    return items;
  }
}
```

---

## Shared Configuration Pattern

Even with per-feature queries, maintain shared configuration centrally:

```typescript
// api/src/infrastructure/queries/config.ts

/**
 * Shared query configuration
 * Used by all feature query modules
 */
export const QueryConfig = {
  /** Database schema name */
  schema: 'M3FDBPRD',
  
  /** Default page size for list views */
  defaultPageSize: 25,
  
  /** Maximum allowed page size (prevent abuse) */
  maxPageSize: 100,
  
  /** Query timeout in milliseconds */
  timeout: 30000,
  
  /** Maximum retries for transient failures */
  maxRetries: 3
} as const;

export type QueryConfig = typeof QueryConfig;
```

Each feature imports this config:

```typescript
// features/customers/customerQueries.ts
import { QueryConfig } from '../../infrastructure/queries/config';

const SCHEMA = QueryConfig.schema;
// Now use SCHEMA in all queries
```

---

## Handling Truly Shared Queries (If Needed)

In a read-only system with ~50 tables, you might find some queries or fragments used across features. For example:

- Product lookup used in orders, manufacturing orders, suppliers
- Common date range filters
- Common status code joins

**Approach:** Only extract to `shared/` if genuinely reused across 3+ features.

```
api/src/infrastructure/queries/
  └── shared/
      ├── productFragments.ts     (Product-related joins used everywhere)
      └── dateFilters.ts          (Common date range logic)
```

Example shared fragment:

```typescript
// infrastructure/queries/shared/productFragments.ts
import { QueryConfig } from '../config';

const SCHEMA = QueryConfig.schema;

/**
 * Standard product information join
 * Used across: Orders, Manufacturing Orders, Inventory views
 */
export const PRODUCT_INFO_JOIN = `
LEFT JOIN ${SCHEMA}.MITMAS AS prod 
  ON prod.MMITNO = {itemColumn}
`;

/**
 * Product detail with unit of measure
 * Returns: productDescription, unitOfMeasure, productClass
 */
export const PRODUCT_DETAIL_COLUMNS = `
  prod.MMITDS AS productDescription,
  prod.MMUNMS AS unitOfMeasure,
  prod.MMITCL AS productClass
`;
```

Usage in feature query:

```typescript
// features/orders/orderQueries.ts
import { PRODUCT_INFO_JOIN, PRODUCT_DETAIL_COLUMNS } from '../../infrastructure/queries/shared/productFragments';

export const ORDER_ITEMS_QUERY = `
SELECT 
  line.OBITNO AS itemNumber,
  ${PRODUCT_DETAIL_COLUMNS}
FROM ${SCHEMA}.OOLINE AS line
${PRODUCT_INFO_JOIN.replace('{itemColumn}', 'line.OBITNO')}
WHERE line.OBORNO = @orderNumber;
`;
```

**Rule:** Only create shared fragments when the same SQL pattern is copy-pasted 3+ times. Otherwise, keep it in the feature.

---

## Updated Implementation Phases

### Phase 1: Shared Infrastructure (Minimal)
1. Create `api/src/infrastructure/queries/config.ts` with shared schema config
2. Document query naming conventions
3. Create query template showing drilldown pattern

**Deliverable:** Shared config that all features will import

### Phase 2: Extract Customer Queries (Proof of Concept)
1. Create `api/src/features/customers/customerQueries.ts`
2. Extract existing SQL from `customerRepository.ts` 
3. Organize queries by UI hierarchy (Level 0: list → Level 1: detail → Level 2: orders → Level 3: items)
4. Add comprehensive JSDoc comments explaining:
   - Which UI view uses the query
   - What level in the drilldown hierarchy
   - What the next/previous drilldown is
5. Add `CustomerQueryMetadata` object for documentation
6. Update `customerRepository.ts` to import from `./customerQueries`
7. Test all customer views and drilldown flows

**Deliverable:** Complete customer feature as template for other features

### Phase 3: Standards & Documentation
1. Document query organization pattern (list/detail/drilldown hierarchy)
2. Create template file for new features
3. Document performance optimization guidelines for 74M records
4. Create style guide for:
   - Query naming (ENTITY_VIEW_QUERY pattern)
   - Comment structure
   - Metadata documentation
5. Document when to create shared queries vs. keep in feature

**Deliverable:** Standards document and template files

### Phase 4: Expand to Other Features
1. Apply pattern to suppliers feature
2. Apply pattern to orders feature
3. Apply pattern to manufacturing orders feature
4. Apply pattern to products feature
5. Identify any truly shared query fragments → extract to `infrastructure/queries/shared/`

**Deliverable:** All 50-table scope covered with consistent pattern

### Phase 5: Testing & Optimization
1. Review all queries for performance with 74M records
2. Ensure proper indexing recommendations are documented
3. Test all drilldown flows end-to-end
4. Document query performance benchmarks

**Deliverable:** Production-ready, optimized query module

---

## Comparison: Original vs. Updated Recommendation

| Factor | Original Rec (Option 2 Centralized) | Updated Rec (Option 1 Per-Feature) | Why Changed |
|--------|-------------------------------------|-------------------------------------|-------------|
| **Table Count** | 3693 → needs central control | 50 → feature organization sufficient | Smaller scope removes centralization need |
| **Operations** | CRUD → needs oversight | Read-only → simpler security model | No write operations to audit centrally |
| **Query Patterns** | Standard | Drilldown hierarchies | Related queries should stay together |
| **Frontend Needs** | Not specified | Master-detail UI | Queries should mirror UI structure |
| **Developer UX** | DBA-centric | Frontend-centric | Frontend devs are primary consumers |
| **Maintenance** | Central SQL oversight | Feature-level ownership | 50 tables won't create sprawl issues |

---

## When to Still Use Centralized Approach

You should reconsider and use **Option 2 (Centralized)** if:

❌ **Queries are heavily reused across features** (not typical with UI-driven drilldowns)  
❌ **Strict DBA review required before any deployment** (even read-only)  
❌ **Multiple backend teams working independently** (coordination overhead)  
❌ **Compliance requires single SQL audit point** (industry-specific regulations)  
❌ **You plan to scale to many more tables** (50 → 500+)  

For your current use case (read-only, 50 tables, drilldown views), these concerns don't apply strongly enough to outweigh the developer experience benefits of per-feature organization.

---

## Final Updated Recommendation Summary

**Choose Option 1 (Per-Feature Query Module)** because:

1. ✅ **Read-only operations** make security audit simpler
2. ✅ **50 tables** is a manageable scope without centralization
3. ✅ **Drilldown hierarchies** benefit from grouping related queries
4. ✅ **Frontend-driven development** needs queries near features
5. ✅ **Simpler refactoring** from current structure
6. ✅ **Better developer experience** for frontend team

**Structure:**
- Each feature folder contains its own `*Queries.ts` file
- All related queries (list/detail/drilldowns) in one file per feature
- Shared config in `infrastructure/queries/config.ts`
- Only extract to `shared/` if genuinely reused 3+ times

**Next Steps:**
1. Decide: Proceed with Option 1 (Per-Feature)?
2. Approve implementation approach
3. Start with customer feature as proof of concept
4. Expand to remaining ~10-15 entity features

---

**Updated Document Status:** Awaiting approval of updated approach  
**Updated Recommendation:** Option 1 (Per-Feature) for read-only + drilldown use case  
**Next Action:** User approval to proceed with implementation

---
---

# FURTHER REFINEMENT: Addressing Inline SQL Anti-Pattern Concerns

**Date:** December 3, 2025  
**Concern Raised:** "Why I'm intuitively uncomfortable with having inline SQL in the ts, I cannot get over the feeling that it's an anti-pattern"

## Validation of the Concern

**Your intuition is 100% correct.** Inline SQL in TypeScript files (even in dedicated `*Queries.ts` files) **IS** an anti-pattern for several important reasons:

### Why Inline SQL is Problematic

#### 1. **Tooling and Developer Experience Issues**

| Problem | Impact | Example |
|---------|--------|---------|
| **No SQL syntax highlighting** | Hard to read, easy to make mistakes | Template literals show as strings, not SQL |
| **No SQL linting** | Invalid SQL only found at runtime | Typos like `SELCT` or `FORM` not caught |
| **No SQL formatting** | Inconsistent formatting across queries | Prettier/SQL formatters don't work on strings |
| **No IntelliSense** | No autocomplete for tables/columns | Must memorize schema or reference docs |
| **Poor error messages** | SQL errors are runtime strings, not compile errors | "Syntax error near..." with no line numbers |

#### 2. **DBA and Performance Analysis Problems**

```typescript
// DBA receives this from developer:
const QUERY = `
SELECT * FROM ${SCHEMA}.OCUSMA 
WHERE OKCUNO = @customerNumber
`;

// DBA wants to:
// ❌ Run in Azure Data Studio → Must manually extract and clean
// ❌ Analyze execution plan → Must copy-paste and remove template parts
// ❌ Optimize query → Must edit TypeScript file (uncomfortable for DBAs)
// ❌ Test with different parameters → Must understand TypeScript parameter binding
```

#### 3. **Maintenance and Schema Evolution**

```typescript
// Database schema changes: OCUSMA.OKCUNM renamed to OKCUNM_NEW
// TypeScript compiler: ✅ No errors (it's just a string!)
// Runtime: ❌ "Invalid column name 'OKCUNM'"

const CUSTOMER_LIST = `
SELECT OKCUNM AS customerName  -- This column no longer exists!
FROM ${SCHEMA}.OCUSMA
`;
// Problem: No compile-time protection against schema drift
```

#### 4. **Testing and Validation**

```typescript
// To test this query independently:
const QUERY = `SELECT cus.OKCUNO FROM ${SCHEMA}.OCUSMA AS cus`;

// You must:
// 1. Run the entire TypeScript application
// 2. Trigger the code path that uses this query
// 3. Hope the parameters are correct
// 4. Debug through application logs

// You CANNOT:
// ❌ Run the query directly in Azure Data Studio
// ❌ Test query performance in isolation
// ❌ Validate SQL syntax without starting the app
```

#### 5. **Version Control and Code Review**

```diff
# Git diff shows:
+ const CUSTOMER_QUERY = `
+   SELECT cus.OKCUNO, cus.OKCUNM,
+   COUNT(ord.OAORNO) AS orderCount
+   FROM ${SCHEMA}.OCUSMA AS cus
+   LEFT JOIN ${SCHEMA}.OOHEAD AS ord ON ord.OACUNO = cus.OKCUNO
+   GROUP BY cus.OKCUNO, cus.OKCUNM
+ `;

# Problems:
# - SQL changes mixed with TypeScript changes
# - Harder to review SQL changes specifically
# - Can't use SQL-specific diff tools
# - Template literal syntax obscures actual SQL
```

#### 6. **String Template Dangers**

```typescript
// Easy mistakes with template literals:
const QUERY1 = `SELECT * FROM ${SCHEMA}.OCUSMA`;  // ✅ Correct

const QUERY2 = `SELECT * FROM $SCHEMA.OCUSMA`;    // ❌ Bug! Missing {}

const QUERY3 = `SELECT * FROM ${SCHMA}.OCUSMA`;   // ❌ Bug! Typo in variable

const QUERY4 = `SELECT * FROM '${SCHEMA}'.OCUSMA`; // ❌ Bug! Extra quotes

// All of these compile successfully but fail at runtime!
```

---

## The Right Solution: SQL Files (Option 4 Hybrid)

### Refined Recommendation: **Per-Feature with SQL Files**

Combine the best of **Option 1** (per-feature organization) with **Option 4** (SQL files):

```
api/src/features/customers/
  ├── queries/                        📁 Pure SQL files
  │   ├── list.sql                    (Customer list view)
  │   ├── count.sql                   (Pagination count)
  │   ├── detail.sql                  (Customer detail)
  │   ├── orders.sql                  (Orders drilldown)
  │   └── order-items.sql             (Order items drilldown)
  │
  ├── customerQueries.ts              (Query loader/registry)
  ├── customerRepository.ts           (Business logic)
  └── customerTypes.ts                (TypeScript types)
```

### Benefits of This Approach:

✅ **True separation** - SQL files contain only SQL  
✅ **Full tooling** - SQL editors, linters, formatters all work  
✅ **DBA-friendly** - Open `.sql` file, copy to Azure Data Studio, run  
✅ **Easy testing** - Test SQL independently before integration  
✅ **Clear version control** - SQL changes in `.sql` files, TS changes in `.ts` files  
✅ **Feature organization** - Still grouped by feature (your drilldown hierarchy)  
✅ **No template errors** - Schema substitution handled safely by loader  
✅ **Production-ready** - Meets ISO 25010 maintainability standards  

---

## Implementation Pattern: SQL Files with Loader

### 1. Pure SQL Files

```sql
-- api/src/features/customers/queries/list.sql
/**
 * Customer List Query
 * 
 * Purpose: Display paginated customer list
 * Used by: /customers page
 * Performance: Optimized for 74M+ records
 * 
 * Parameters:
 *   @namePattern - NVARCHAR - Optional customer name filter (use % wildcards)
 *   @customerNumber - NVARCHAR - Optional exact customer number
 *   @phone - NVARCHAR - Optional phone number
 *   @offset - INT - Pagination offset
 *   @limit - INT - Page size
 * 
 * Returns: customerNumber, customerName, phone, orderCount
 * 
 * Performance Notes:
 *   - Requires index on OCUSMA.OKCUNM for name search
 *   - LEFT JOIN to OOHEAD uses index on OACUNO
 * 
 * Drilldown: User clicks row → customer-detail.sql
 */

SELECT 
  cus.OKCUNO AS customerNumber,
  cus.OKCUNM AS customerName,
  cus.OKPHNO AS phone,
  COUNT(DISTINCT ord.OAORNO) AS orderCount
FROM {{SCHEMA}}.OCUSMA AS cus
LEFT JOIN {{SCHEMA}}.OOHEAD AS ord 
  ON ord.OACUNO = cus.OKCUNO
WHERE 
  (@namePattern IS NULL OR cus.OKCUNM LIKE @namePattern)
  AND (@customerNumber IS NULL OR cus.OKCUNO = @customerNumber)
  AND (@phone IS NULL OR cus.OKPHNO = @phone)
GROUP BY 
  cus.OKCUNO, 
  cus.OKCUNM, 
  cus.OKPHNO
ORDER BY cus.OKCUNM
OFFSET @offset ROWS 
FETCH NEXT @limit ROWS ONLY;
```

```sql
-- api/src/features/customers/queries/detail.sql
/**
 * Customer Detail Query
 * 
 * Purpose: Display complete customer information
 * Used by: /customers/:id page
 * UI Flow: User clicked customer from list → sees this detail view
 * Next: User can click "Orders" tab → customer-orders.sql
 * 
 * Parameters:
 *   @customerNumber - NVARCHAR - Customer number (required)
 * 
 * Returns: Complete customer info with order statistics
 */

SELECT 
  cus.OKCUNO AS customerNumber,
  cus.OKCUNM AS customerName,
  cus.OKPHNO AS phone,
  cus.OKVTCD AS vat,
  cus.OKADDR1 AS address1,
  cus.OKADDR2 AS address2,
  cus.OKCITY AS city,
  cus.OKPONO AS postalCode,
  cus.OKCOUN AS country,
  COUNT(DISTINCT ord.OAORNO) AS orderCount,
  SUM(ord.OATOAM) AS totalOrderValue,
  MAX(ord.OAORDT) AS latestOrderDate,
  MIN(ord.OAORDT) AS firstOrderDate
FROM {{SCHEMA}}.OCUSMA AS cus
LEFT JOIN {{SCHEMA}}.OOHEAD AS ord 
  ON ord.OACUNO = cus.OKCUNO
WHERE cus.OKCUNO = @customerNumber
GROUP BY 
  cus.OKCUNO, cus.OKCUNM, cus.OKPHNO, cus.OKVTCD,
  cus.OKADDR1, cus.OKADDR2, cus.OKCITY, cus.OKPONO, cus.OKCOUN;
```

```sql
-- api/src/features/customers/queries/orders.sql
/**
 * Customer Orders Query (Drilldown)
 * 
 * Purpose: List all orders for a specific customer
 * Used by: /customers/:id page - Orders tab
 * UI Flow: Customer detail → Orders tab → This query
 * Next: User can click order → order-items.sql
 * 
 * Parameters:
 *   @customerNumber - NVARCHAR - Customer number (required)
 *   @offset - INT - Pagination offset
 *   @limit - INT - Page size
 */

SELECT 
  ord.OAORNO AS orderNumber,
  ord.OACUOR AS customerOrderNumber,
  ord.OAORDT AS orderDate,
  ord.OAORST AS orderStatus,
  ord.OADWDT AS deliveryDate,
  COUNT(DISTINCT line.OBITNO) AS itemCount,
  SUM(line.OBORQT * line.OBNEPR) AS orderTotal
FROM {{SCHEMA}}.OOHEAD AS ord
LEFT JOIN {{SCHEMA}}.OOLINE AS line 
  ON line.OBORNO = ord.OAORNO
WHERE ord.OACUNO = @customerNumber
GROUP BY 
  ord.OAORNO, ord.OACUOR, ord.OAORDT, 
  ord.OAORST, ord.OADWDT
ORDER BY ord.OAORDT DESC
OFFSET @offset ROWS 
FETCH NEXT @limit ROWS ONLY;
```

### 2. TypeScript Query Loader

```typescript
// api/src/infrastructure/queries/queryLoader.ts
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Query loader with caching and schema substitution
 * Loads .sql files from disk and prepares them for execution
 */
export class QueryLoader {
  private cache = new Map<string, string>();

  /**
   * Load a SQL query from file
   * @param filePath - Path to .sql file relative to project root
   * @param schema - Schema name to substitute for {{SCHEMA}} placeholders
   * @returns Prepared SQL query string
   */
  load(filePath: string, schema: string): string {
    const cacheKey = `${filePath}:${schema}`;

    if (!this.cache.has(cacheKey)) {
      try {
        // Read SQL file from disk
        const absolutePath = join(__dirname, '../../', filePath);
        const sqlTemplate = readFileSync(absolutePath, 'utf-8');

        // Replace schema placeholders
        const sql = sqlTemplate.replace(/\{\{SCHEMA\}\}/g, schema);

        // Cache the result
        this.cache.set(cacheKey, sql);
      } catch (error) {
        throw new Error(
          `Failed to load SQL query from ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return this.cache.get(cacheKey)!;
  }

  /**
   * Clear the cache (useful for testing or hot-reload)
   */
  clearCache(): void {
    this.cache.clear();
  }
}
```

### 3. Feature Query Registry

```typescript
// api/src/features/customers/customerQueries.ts
import { QueryLoader } from '../../infrastructure/queries/queryLoader';
import { QueryConfig } from '../../infrastructure/queries/config';

const loader = new QueryLoader();
const SCHEMA = QueryConfig.schema;

/**
 * Customer query registry
 * All queries are loaded from .sql files in ./queries/ directory
 */
export const CustomerQueries = {
  /**
   * Customer list with order counts
   * File: features/customers/queries/list.sql
   */
  LIST: loader.load('features/customers/queries/list.sql', SCHEMA),

  /**
   * Count total customers (for pagination)
   * File: features/customers/queries/count.sql
   */
  COUNT: loader.load('features/customers/queries/count.sql', SCHEMA),

  /**
   * Customer detail with statistics
   * File: features/customers/queries/detail.sql
   */
  DETAIL: loader.load('features/customers/queries/detail.sql', SCHEMA),

  /**
   * Customer orders (drilldown level 1)
   * File: features/customers/queries/orders.sql
   */
  ORDERS: loader.load('features/customers/queries/orders.sql', SCHEMA),

  /**
   * Order line items (drilldown level 2)
   * File: features/customers/queries/order-items.sql
   */
  ORDER_ITEMS: loader.load('features/customers/queries/order-items.sql', SCHEMA)
} as const;

/**
 * Query metadata for documentation
 */
export const CustomerQueryMetadata = {
  LIST: { file: 'list.sql', view: 'Customer List', level: 0 },
  COUNT: { file: 'count.sql', view: 'Pagination', level: 0 },
  DETAIL: { file: 'detail.sql', view: 'Customer Detail', level: 1 },
  ORDERS: { file: 'orders.sql', view: 'Customer Orders', level: 2 },
  ORDER_ITEMS: { file: 'order-items.sql', view: 'Order Items', level: 3 }
} as const;
```

### 4. Repository (Unchanged)

```typescript
// api/src/features/customers/customerRepository.ts
import { SqlClient } from '../../infrastructure/sqlClient';
import { CustomerQueries } from './customerQueries';
import { CustomerListItem, CustomerDetail } from './customerTypes';

export class CustomerRepository {
  constructor(private readonly clientFactory: () => Promise<SqlClient>) {}

  async searchCustomers(criteria: {
    namePattern?: string;
    customerNumber?: string;
    phone?: string;
    limit: number;
    offset: number;
  }) {
    const client = await this.clientFactory();
    
    const params = {
      namePattern: criteria.namePattern ? `%${criteria.namePattern}%` : null,
      customerNumber: criteria.customerNumber ?? null,
      phone: criteria.phone ?? null,
      limit: criteria.limit,
      offset: criteria.offset
    };

    const [{ total = 0 } = { total: 0 }] = await client.query<{ total: number }>(
      CustomerQueries.COUNT,
      params
    );

    const rows = await client.query<CustomerListItem>(
      CustomerQueries.LIST,
      params
    );

    return { total, customers: rows };
  }

  async getCustomerDetail(customerNumber: string): Promise<CustomerDetail | null> {
    const client = await this.clientFactory();
    const [detail] = await client.query<CustomerDetail>(
      CustomerQueries.DETAIL,
      { customerNumber }
    );
    return detail ?? null;
  }

  // ... other methods
}
```

---

## DBA Workflow with SQL Files

### Scenario: DBA Needs to Optimize Customer List Query

**With Inline SQL (Bad):**
1. Open `customerQueries.ts` file
2. Find the query string
3. Copy the template literal
4. Remove TypeScript syntax (`, ${}, etc.)
5. Replace `${SCHEMA}` manually
6. Paste into Azure Data Studio
7. Test and optimize
8. Copy optimized SQL back
9. Re-add TypeScript template syntax
10. Hope you didn't break anything

**With SQL Files (Good):**
1. Open `features/customers/queries/list.sql` directly in Azure Data Studio
2. Replace `{{SCHEMA}}` with `M3FDBPRD`
3. Run, analyze execution plan, optimize
4. Save changes directly to `list.sql`
5. Done! TypeScript automatically picks up changes

---

## Developer Workflow Comparison

### Testing a Query

**Inline SQL (Bad):**
```bash
# Must run the entire application to test SQL
npm run dev
# Navigate to the feature in browser
# Check logs for query output
# Repeat for every SQL change
```

**SQL Files (Good):**
```bash
# Open Azure Data Studio
# File → Open → features/customers/queries/list.sql
# Replace {{SCHEMA}} with M3FDBPRD
# Press F5 to execute
# Instant feedback on SQL correctness
```

### Query Performance Analysis

**Inline SQL:**
- Extract SQL from TypeScript string
- Clean up template syntax
- Run in Azure Data Studio
- Cannot easily see execution plan

**SQL Files:**
- Open `.sql` file directly
- Right-click → Display Estimated Execution Plan
- Optimize immediately
- Save changes

---

## Addressing Deployment Concerns

### Concern: "Must deploy .sql files with application"

**Solution:** This is actually a benefit, not a drawback:

✅ **Version control** - SQL versioned with application code  
✅ **Atomic deployments** - SQL and code deployed together  
✅ **Rollback safety** - Rolling back code also rolls back queries  
✅ **No schema drift** - SQL files always match application version  

### Build Configuration

```json
// package.json
{
  "scripts": {
    "build": "tsc && npm run copy-sql",
    "copy-sql": "copyfiles -u 1 'src/**/*.sql' dist/"
  }
}
```

Or with modern bundlers (esbuild, webpack):

```javascript
// esbuild.config.js
{
  loader: {
    '.sql': 'text'  // Bundle SQL files as text assets
  }
}
```

---

## Final Refined Recommendation

### ✅ **Use SQL Files (Per-Feature Organization)**

**Structure:**
```
api/src/features/
  ├── customers/queries/*.sql
  ├── suppliers/queries/*.sql
  └── orders/queries/*.sql

api/src/infrastructure/queries/
  ├── queryLoader.ts         (SQL file loader)
  └── config.ts              (Shared config)
```

**Why This is Best:**
1. ✅ Solves your anti-pattern concern (true SQL/TS separation)
2. ✅ Maintains per-feature organization (drilldown hierarchy)
3. ✅ Provides proper tooling (SQL editors work)
4. ✅ DBA-friendly workflow (direct file access)
5. ✅ Production-ready (ISO 25010 maintainability)
6. ✅ Read-only safety (no complex transaction issues)
7. ✅ Testable (SQL files runnable independently)

**Trade-offs:**
- ⚠️ Requires build step to copy SQL files
- ⚠️ Runtime file loading (mitigated by caching)
- ⚠️ Schema substitution (simple find-replace: `{{SCHEMA}}` → `M3FDBPRD`)

These trade-offs are **well worth it** to avoid the anti-pattern of inline SQL.

---

**Status:** SQL Files approach recommended to address anti-pattern concerns  
**Next Action:** User approval to proceed with SQL file implementation

--