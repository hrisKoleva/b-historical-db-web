# DAL Implementation Plan - Production Ready

**Date:** December 3, 2025  
**Status:** READY FOR IMPLEMENTATION  
**Based on:**
- 11_4_DAL_approach.md (Final architecture)
- 11_4_DAL_additional_instructions.md (Performance & AI guidelines)
- 11_3_1_DAL_decision_critique.md (Expert review)
- Existing codebase analysis

---

## Executive Summary

**Goal:** Implement production-ready Data Access Layer for Customers AND create reusable templates for 5 additional features (Products, Suppliers, Customer Orders, Manufacturing Orders, Purchase Orders).

**Approach:**
- Phase 1: Core Infrastructure (2-3 hours)
- Phase 2: Customers Implementation (4-5 hours)
- Phase 3: Create Reusable Templates (2-3 hours)
- Phase 4: Testing & Validation (2-3 hours)
- **Total Estimated Time:** 10-14 hours

**Success Criteria:**
- ✅ Customers feature fully working with new DAL
- ✅ Templates ready for 5 features
- ✅ All tests passing
- ✅ Performance validated
- ✅ DBA-friendly SQL files
- ✅ Production-ready code quality

---

## Current State Analysis

### What We Have
```
api/src/
  infrastructure/
    sqlClient.ts              ✅ Existing (needs enhancement)
    azureSqlTokenProvider.ts  ✅ Existing
    keyVaultSecretProvider.ts ✅ Existing
  
  features/customers/
    customerRepository.ts     ⚠️ Has inline SQL (needs refactoring)
    customerService.ts        ✅ Exists (minimal changes)
    customerRoutes.ts         ✅ Exists (no changes)
    __tests__/                ✅ Tests exist (need updating)
```

### What We Need to Build
```
api/src/
  infrastructure/db/
    config.ts                 🆕 New (lazy validation)
    loadQuery.ts              🆕 New (query loader)
    queryTimer.ts             🆕 New (monitoring wrapper)
  
  features/customers/
    queries/                  🆕 New folder
      count.sql               🆕 Extract from inline
      list.sql                🆕 Extract from inline
      detail.sql              🆕 New (if needed)
    customerQueries.ts        🆕 New (query registry)
    customerTypes.ts          🆕 New (TypeScript types)
    customerRepository.ts     ♻️ Refactor (use SQL files)
  
  test-resources/             🆕 New (test fixtures)
```

---

## Table Mappings (From Requirements)

### Customers
- **Primary Table:** `OCUSMA` (Customer Master)
- **Related:** `OOHEAD` (Customer Order Header)
- **Schema:** M3FDBPRD (Primary)

### Products (Items)
- **Primary Table:** `MITMAS` (Item Master)
- **Related:** `MITFAC` (Item Facility), `MITBAL` (Item Warehouse)
- **Schema:** M3FDBPRD (Primary)

### Suppliers
- **Primary Table:** `CIDMAS` (Supplier Master)
- **Related:** `CIDADR` (Vendor Address)
- **Schema:** M3FDBPRD (Primary)

### Customer Orders
- **Primary Table:** `OOHEAD` (Customer Order Header)
- **Related:** `OOLINE` (Customer Order Line)
- **Schema:** M3FDBPRD (Primary)

### Manufacturing Orders
- **Primary Table:** `MWOHED` (Manufacturing Order Header)
- **Related:** `MWOPTR` (Operation Transactions)
- **Schema:** M3FDBPRD (Primary)

### Purchase Orders
- **Primary Table:** `MPHEAD` (Purchase Order Header)
- **Related:** `MPLINE` (PO Line)
- **Schema:** M3FDBPRD (Primary)

---

## Phase 1: Core Infrastructure (2-3 hours)

### Task 1.1: Create Database Configuration
**File:** `api/src/infrastructure/db/config.ts`

**Actions:**
1. Create new file with lazy validation
2. Define schema configuration (PRIMARY, SECONDARY)
3. Define query limits and timeouts
4. Add `initDatabaseConfig()` function
5. Add validation logic

**Test:**
```bash
npm run test -- config.test.ts
```

**Acceptance Criteria:**
- ✅ Config loads without throwing
- ✅ `initDatabaseConfig()` validates required env vars
- ✅ Schemas accessible via `DatabaseConfig.schemas`
- ✅ Limits accessible via `DatabaseConfig.limits`

**Estimated Time:** 30 minutes

---

### Task 1.2: Create Query Loader Utility
**File:** `api/src/infrastructure/db/loadQuery.ts`

**Actions:**
1. Create `loadQuery(relativePath, schemas)` function
2. Implement file reading with `readFileSync`
3. Implement schema placeholder substitution
4. Implement caching with `Map`
5. Add validation for unreplaced placeholders
6. Add debug-only logging
7. Create `clearQueryCache()` for testing
8. Create `getQueryCacheStats()` for health checks

**Test:**
```bash
npm run test -- loadQuery.test.ts
```

**Acceptance Criteria:**
- ✅ Loads SQL file from disk
- ✅ Replaces `{{SCHEMA}}` placeholders
- ✅ Replaces multiple schemas (`{{SCHEMA_PRIMARY}}`, `{{SCHEMA_SECONDARY}}`)
- ✅ Caches results
- ✅ Throws clear error for missing files
- ✅ Throws clear error for unreplaced placeholders
- ✅ Logs only in development
- ✅ All tests pass

**Estimated Time:** 45 minutes

---

### Task 1.3: Enhance SqlClient with Query Timing
**File:** `api/src/infrastructure/sqlClient.ts`

**Actions:**
1. Add timing wrapper around query execution
2. Log slow queries (>5s warning, >10s alert)
3. Add correlation ID parameter
4. Add duration logging in development
5. Keep existing token retry logic
6. Ensure ONE pool per process (already correct)

**Changes:**
```typescript
// Add to query method signature:
async query<T>(
  queryString: string,
  params: Record<string, unknown> = {},
  correlationId?: string
): Promise<T[]>

// Add timing logic before/after query execution
```

**Test:**
```bash
npm run test -- sqlClient.test.ts
```

**Acceptance Criteria:**
- ✅ Query timing captured
- ✅ Slow queries logged (mock test)
- ✅ Correlation ID passed through
- ✅ Existing tests still pass
- ✅ No breaking changes to existing code

**Estimated Time:** 45 minutes

---

### Task 1.4: Create Test Resources Folder
**Folder:** `api/src/test-resources/`

**Actions:**
1. Create folder structure:
   ```
   test-resources/
     queries/
       test-simple.sql
       test-multi-schema.sql
     fixtures/
       (empty for now)
   ```
2. Create test SQL files for loadQuery tests
3. Update `.gitignore` if needed

**Acceptance Criteria:**
- ✅ Folder structure created
- ✅ Test SQL files exist
- ✅ loadQuery tests reference correct paths

**Estimated Time:** 15 minutes

---

### Task 1.5: Create Health Check Endpoints
**File:** `api/src/infrastructure/health.ts`

**Actions:**
1. Create Express router
2. Add `GET /health` - basic health check
3. Add `GET /health/queries` - query cache stats
4. Add `GET /health/db` - database connection check
5. Register in `app.ts`

**Test:**
```bash
npm run test -- health.test.ts
```

**Acceptance Criteria:**
- ✅ `/health` returns 200
- ✅ `/health/queries` shows cache size
- ✅ `/health/db` tests connection
- ✅ All endpoints return JSON

**Estimated Time:** 30 minutes

---

### Task 1.6: Update App Startup Sequence
**File:** `api/src/server.ts`

**Actions:**
1. Add explicit `initDatabaseConfig()` call
2. Ensure SqlClient connects before routes load
3. Add graceful shutdown handler
4. Add startup logging

**Changes:**
```typescript
async function startServer() {
  // 1. Validate configuration
  console.log('[Startup] Validating configuration...');
  initDatabaseConfig();
  
  // 2. Connect to database
  console.log('[Startup] Connecting to database...');
  await sqlClient.connect();
  
  // 3. Register routes (loads queries)
  console.log('[Startup] Loading queries and routes...');
  // ... existing route registration
  
  // 4. Start server
  app.listen(PORT, () => {
    console.log(`[Startup] Server ready on port ${PORT}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await sqlClient.close();
  process.exit(0);
});
```

**Test:**
```bash
npm run dev
# Verify startup logs
```

**Acceptance Criteria:**
- ✅ App starts successfully
- ✅ Logs show initialization sequence
- ✅ Database connects before routes
- ✅ Health checks accessible

**Estimated Time:** 30 minutes

---

## Phase 2: Customers Implementation (4-5 hours)

### Task 2.1: Extract Customer SQL Files
**Folder:** `api/src/features/customers/queries/`

**Actions:**
1. Create `queries/` folder
2. Extract `count.sql` from existing inline SQL
3. Extract `list.sql` (main data query)
4. Add SQL documentation headers:
   - PURPOSE
   - USED BY
   - PARAMETERS
   - RETURNS
   - PERFORMANCE NOTES
   - REQUIRED INDEXES
5. Replace hardcoded schema with `{{SCHEMA}}`
6. Test each query in Azure Data Studio

**Files to Create:**

**count.sql:**
```sql
/**
 * Customer Count Query
 * 
 * PURPOSE: Count total customers matching search criteria
 * USED BY: GET /api/customers (for pagination)
 * PERFORMANCE: Fast - only counts, no joins
 * 
 * PARAMETERS:
 *   @namePattern NVARCHAR - Customer name filter (NULL = no filter)
 *   @customerNumber NVARCHAR - Exact customer number (NULL = no filter)
 *   @phone NVARCHAR - Phone number filter (NULL = no filter)
 * 
 * RETURNS:
 *   total INT - Number of customers matching criteria
 * 
 * REQUIRED INDEXES:
 *   - OCUSMA: OKCUNO (PK), OKCUNM (for LIKE search)
 */

SELECT COUNT(*) AS total
FROM {{SCHEMA}}.OCUSMA AS cus
WHERE 
  (@namePattern IS NULL OR cus.OKCUNM LIKE @namePattern)
  AND (@customerNumber IS NULL OR cus.OKCUNO = @customerNumber)
  AND (@phone IS NULL OR cus.OKPHNO = @phone);
```

**list.sql:**
```sql
/**
 * Customer List Query
 * 
 * PURPOSE: Display paginated list of customers with order counts
 * USED BY: GET /api/customers
 * 
 * PARAMETERS:
 *   @namePattern NVARCHAR - Customer name filter with wildcards
 *   @customerNumber NVARCHAR - Exact customer number match
 *   @phone NVARCHAR - Phone number filter
 *   @offset INT - Pagination offset
 *   @limit INT - Page size (max 100, enforced by repository)
 * 
 * RETURNS:
 *   customerNumber NVARCHAR - Unique customer identifier (OKCUNO)
 *   customerName NVARCHAR - Customer name (OKCUNM)
 *   phone NVARCHAR - Phone number (OKPHNO)
 *   vat NVARCHAR - VAT number (OKVTCD)
 *   orderCount INT - Total orders for this customer
 *   latestOrderDate DATE - Most recent order date
 *   recentOrdersJson NVARCHAR - JSON array of 5 most recent orders
 * 
 * PERFORMANCE NOTES:
 *   - CTE for order aggregation
 *   - OUTER APPLY for JSON generation
 *   - Uses index on OKCUNM for name search (LIKE)
 *   - LEFT JOIN to OOHEAD uses index on OACUNO
 * 
 * REQUIRED INDEXES:
 *   - OCUSMA: OKCUNO (PK), OKCUNM (for LIKE search)
 *   - OOHEAD: OACUNO (FK to customer), OAORDT (for ordering)
 */

WITH CustomerOrders AS (
  SELECT
    head.OACUNO AS CustomerNumber,
    COUNT(DISTINCT head.OAORNO) AS OrderCount,
    MAX(head.OAORDT) AS LatestOrderDate
  FROM {{SCHEMA}}.OOHEAD AS head
  GROUP BY head.OACUNO
)
SELECT
  cus.OKCUNO AS customerNumber,
  cus.OKCUNM AS customerName,
  cus.OKPHNO AS phone,
  cus.OKVTCD AS vat,
  orders.OrderCount AS orderCount,
  orders.LatestOrderDate AS latestOrderDate,
  recentOrders.recentOrdersJson AS recentOrdersJson
FROM {{SCHEMA}}.OCUSMA AS cus
LEFT JOIN CustomerOrders AS orders ON orders.CustomerNumber = cus.OKCUNO
OUTER APPLY (
  SELECT TOP (5)
    head.OAORNO AS orderNumber,
    head.OACUOR AS customerOrderNumber,
    head.OAORDT AS orderDate
  FROM {{SCHEMA}}.OOHEAD AS head
  WHERE head.OACUNO = cus.OKCUNO
  ORDER BY head.OAORDT DESC
  FOR JSON PATH
) AS recentOrders(recentOrdersJson)
WHERE 
  (@namePattern IS NULL OR cus.OKCUNM LIKE @namePattern)
  AND (@customerNumber IS NULL OR cus.OKCUNO = @customerNumber)
  AND (@phone IS NULL OR cus.OKPHNO = @phone)
ORDER BY cus.OKCUNM
OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
```

**Test in Azure Data Studio:**
```sql
-- Replace {{SCHEMA}} with M3FDBPRD
-- Run with test parameters:
DECLARE @namePattern NVARCHAR(50) = '%KLINGER%'
DECLARE @customerNumber NVARCHAR(50) = NULL
DECLARE @phone NVARCHAR(50) = NULL
DECLARE @offset INT = 0
DECLARE @limit INT = 25

-- Run count.sql
-- Run list.sql
-- Verify results
-- Check execution plan
```

**Acceptance Criteria:**
- ✅ SQL files are syntactically valid
- ✅ All queries tested in Azure Data Studio
- ✅ Performance acceptable (< 3 seconds)
- ✅ Documentation complete
- ✅ Execution plans reviewed
- ✅ Placeholders documented

**Estimated Time:** 1 hour

---

### Task 2.2: Create Customer TypeScript Types
**File:** `api/src/features/customers/customerTypes.ts`

**Actions:**
1. Extract types from existing `customerRepository.ts`
2. Add comprehensive JSDoc comments
3. Create reusable generic types

**Code:**
```typescript
/**
 * Customer Types
 * 
 * PURPOSE: TypeScript types for customer data structures
 */

/**
 * Customer search criteria
 */
export type CustomerSearchCriteria = {
  /** Customer name filter (partial match with LIKE) */
  name?: string;
  
  /** Exact customer number match */
  customerNumber?: string;
  
  /** Phone number filter */
  phone?: string;
  
  /** Pagination offset (0-based) */
  offset: number;
  
  /** Page size (max enforced by repository) */
  limit: number;
};

/**
 * Customer list item (from list.sql)
 */
export type CustomerListItem = {
  customerNumber: string;
  customerName: string;
  phone: string | null;
  vat: string | null;
  orderCount: number | null;
  latestOrderDate: string | null;
  recentOrders: Array<{
    orderNumber: string;
    customerOrderNumber?: string;
    orderDate?: string;
  }>;
};

/**
 * Generic pagination info
 */
export type PageInfo = {
  offset: number;
  limit: number;
};

/**
 * Generic paginated result
 */
export type PagedResult<T> = {
  items: T[];
  total: number;
  page: PageInfo;
};
```

**Acceptance Criteria:**
- ✅ File compiles
- ✅ Types match SQL query outputs
- ✅ All nullable fields marked correctly
- ✅ Generic types (PagedResult) reusable

**Estimated Time:** 30 minutes

---

### Task 2.3: Create Customer Query Registry
**File:** `api/src/features/customers/customerQueries.ts`

**Actions:**
1. Create query registry using `loadQuery()`
2. Load all SQL files
3. Document each query

**Code:**
```typescript
/**
 * Customer Query Registry
 * 
 * PURPOSE: Load and export all customer-related SQL queries
 */

import { loadQuery } from '../../infrastructure/db/loadQuery';
import { DatabaseConfig } from '../../infrastructure/db/config';

const { primary } = DatabaseConfig.schemas;

/**
 * Customer Queries
 */
export const CustomerQueries = {
  /**
   * Count customers matching criteria
   * File: features/customers/queries/count.sql
   * Schemas: Primary only
   */
  COUNT: loadQuery(
    'features/customers/queries/count.sql',
    { SCHEMA: primary }
  ),
  
  /**
   * Customer list with order counts
   * File: features/customers/queries/list.sql
   * Schemas: Primary only
   */
  LIST: loadQuery(
    'features/customers/queries/list.sql',
    { SCHEMA: primary }
  ),
} as const;
```

**Test:**
```bash
npm run test -- customerQueries.test.ts
```

**Acceptance Criteria:**
- ✅ All queries load without error
- ✅ Schemas are substituted correctly
- ✅ Tests pass
- ✅ No SQL syntax errors

**Estimated Time:** 30 minutes

---

### Task 2.4: Refactor Customer Repository
**File:** `api/src/features/customers/customerRepository.ts`

**Actions:**
1. Remove inline SQL constants
2. Import `CustomerQueries`
3. Add optional `includeTotal` parameter
4. Add correlation ID support
5. Keep existing `clientFactory` pattern
6. Preserve existing type mappings

**Key Changes:**
```typescript
/**
 * Customer Repository
 * 
 * PURPOSE: Data access layer for customer operations
 */

import { SqlClient } from '../../infrastructure/sqlClient';
import { DatabaseConfig } from '../../infrastructure/db/config';
import { CustomerQueries } from './customerQueries';
import {
  CustomerSearchCriteria,
  CustomerListItem,
  PagedResult,
} from './customerTypes';

const MAX_PAGE_SIZE = DatabaseConfig.limits.maxPageSize;

export class CustomerRepository {
  constructor(private readonly clientFactory: () => Promise<SqlClient>) {}
  
  /**
   * Search customers with optional count
   * 
   * @param criteria - Search filters and pagination
   * @param options.includeTotal - Whether to execute COUNT query (default: true)
   * @param options.correlationId - Optional correlation ID for logging
   */
  async search(
    criteria: CustomerSearchCriteria,
    options: { includeTotal?: boolean; correlationId?: string } = {}
  ): Promise<PagedResult<CustomerListItem>> {
    const { includeTotal = true, correlationId } = options;
    const client = await this.clientFactory();
    
    const params = {
      namePattern: criteria.name ? `%${criteria.name}%` : null,
      customerNumber: criteria.customerNumber ?? null,
      phone: criteria.phone ?? null,
      offset: criteria.offset,
      limit: Math.min(criteria.limit, MAX_PAGE_SIZE),
    };
    
    // Execute count query only if requested
    let total = 0;
    if (includeTotal) {
      const [{ total: count = 0 } = { total: 0 }] = 
        await client.query<{ total: number }>(
          CustomerQueries.COUNT,
          params,
          correlationId
        );
      total = count;
    }
    
    // Execute data query
    const rows = await client.query<any>(
      CustomerQueries.LIST,
      params,
      correlationId
    );
    
    return {
      items: rows.map(mapRowToCustomerListItem),
      total,
      page: {
        offset: criteria.offset,
        limit: params.limit,
      },
    };
  }
}

// Keep existing mapping functions
const mapRowToCustomerListItem = (row: any): CustomerListItem => {
  // ... existing mapping logic
};
```

**Test:**
```bash
npm run test -- customerRepository.test.ts
```

**Acceptance Criteria:**
- ✅ Repository compiles
- ✅ Uses SQL files instead of inline SQL
- ✅ Optional count works
- ✅ Correlation ID passed through
- ✅ Existing tests pass (after updating)
- ✅ Type safety maintained

**Estimated Time:** 1 hour

---

### Task 2.5: Update Customer Service
**File:** `api/src/features/customers/customerService.ts`

**Actions:**
1. Add `mode` parameter ('full' | 'noTotal')
2. Pass correlation ID through
3. Keep existing business logic

**Key Changes:**
```typescript
/**
 * Customer Service
 * 
 * PURPOSE: Business logic for customer operations
 */

import { CustomerRepository } from './customerRepository';
import {
  CustomerSearchCriteria,
  CustomerListItem,
  PagedResult,
} from './customerTypes';
import { DatabaseConfig } from '../../infrastructure/db/config';

const DEFAULT_PAGE_SIZE = DatabaseConfig.limits.defaultPageSize;

export class CustomerService {
  constructor(private readonly repository: CustomerRepository) {}
  
  /**
   * Search customers with pagination
   * 
   * @param criteria - Search criteria (optional fields)
   * @param options.mode - Search mode: "full" (with total) or "noTotal" (without)
   * @param options.correlationId - Optional correlation ID
   */
  async search(
    criteria: Partial<CustomerSearchCriteria>,
    options: { mode?: 'full' | 'noTotal'; correlationId?: string } = {}
  ): Promise<PagedResult<CustomerListItem>> {
    const { mode = 'full', correlationId } = options;
    
    const searchCriteria: CustomerSearchCriteria = {
      name: criteria.name,
      customerNumber: criteria.customerNumber,
      phone: criteria.phone,
      offset: criteria.offset ?? 0,
      limit: criteria.limit ?? DEFAULT_PAGE_SIZE,
    };
    
    return this.repository.search(
      searchCriteria,
      {
        includeTotal: mode === 'full',
        correlationId,
      }
    );
  }
}
```

**Test:**
```bash
npm run test -- customerService.test.ts
```

**Acceptance Criteria:**
- ✅ Service compiles
- ✅ Mode parameter works
- ✅ Correlation ID passed through
- ✅ Tests pass
- ✅ Business logic preserved

**Estimated Time:** 30 minutes

---

### Task 2.6: Update Customer Controller
**File:** `api/src/features/customers/customerRoutes.ts`

**Actions:**
1. Add correlation ID generation
2. Add error masking
3. Support `mode` query parameter
4. Keep existing route structure

**Key Changes:**
```typescript
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CustomerService } from './customerService';

export function createCustomerRoutes(service: CustomerService): Router {
  const router = Router();
  
  router.get('/', async (req: Request, res: Response) => {
    const correlationId = uuidv4();
    
    try {
      const { name, customerNumber, phone, limit, offset, mode } = req.query;
      
      const result = await service.search(
        {
          name: name as string,
          customerNumber: customerNumber as string,
          phone: phone as string,
          limit: limit ? parseInt(limit as string) : undefined,
          offset: offset ? parseInt(offset as string) : undefined,
        },
        {
          mode: (mode as 'full' | 'noTotal') || 'full',
          correlationId,
        }
      );
      
      // Map to existing response format
      res.json({
        total: result.total,
        customers: result.items,
      });
      
    } catch (error) {
      console.error('[CustomerRoutes] Search failed', {
        error: error instanceof Error ? error.message : error,
        correlationId,
      });
      
      res.status(500).json({
        error: 'Unable to search customers',
        message: 'An error occurred while processing your request',
        correlationId,
      });
    }
  });
  
  return router;
}
```

**Test:**
```bash
npm run test -- customersRouter.test.ts
```

**Acceptance Criteria:**
- ✅ Routes compile
- ✅ Correlation ID generated
- ✅ Errors masked properly
- ✅ Mode parameter supported
- ✅ Existing API contract preserved
- ✅ Tests pass

**Estimated Time:** 45 minutes

---

### Task 2.7: Update Customer Tests
**Files:** `api/src/features/customers/__tests__/*.spec.ts`

**Actions:**
1. Update repository tests for new signature
2. Update service tests for mode parameter
3. Update controller tests for correlation ID
4. Add tests for error masking

**Acceptance Criteria:**
- ✅ All customer tests pass
- ✅ Coverage > 80%
- ✅ Tests cover new parameters

**Estimated Time:** 1 hour

---

### Task 2.8: Manual Testing
**Actions:**
1. Start dev server: `npm run dev`
2. Test health endpoints:
   ```bash
   curl http://localhost:3000/api/health
   curl http://localhost:3000/api/health/queries
   curl http://localhost:3000/api/health/db
   ```
3. Test customer search:
   ```bash
   # With total
   curl "http://localhost:3000/api/customers?name=KLINGER&limit=10&offset=0"
   
   # Without total (faster)
   curl "http://localhost:3000/api/customers?name=KLINGER&limit=10&offset=0&mode=noTotal"
   ```
4. Verify logs show:
   - Query loading at startup
   - Query timing
   - No errors

**Acceptance Criteria:**
- ✅ All endpoints respond correctly
- ✅ Queries return expected data
- ✅ Performance acceptable (< 1s)
- ✅ Logs clean and informative

**Estimated Time:** 30 minutes

---

## Phase 3: Create Reusable Templates (2-3 hours)

### Task 3.1: Create Feature Template Document
**File:** `01_requirements/05_building_steps/13_Feature_Template.md`

**Actions:**
1. Document the complete feature structure
2. Provide step-by-step instructions
3. Include code templates
4. Add checklist for each feature

**Content:**
```markdown
# Feature Implementation Template

## Prerequisites
- Core DAL infrastructure implemented
- Database table mappings known
- Column translations available

## Feature Structure
[Complete template with all files and their contents]

## Implementation Checklist
- [ ] Create queries/ folder
- [ ] Extract SQL files
- [ ] Create types file
- [ ] Create query registry
- [ ] Create repository
- [ ] Create service
- [ ] Create routes
- [ ] Write tests
- [ ] Manual testing
```

**Estimated Time:** 1 hour

---

### Task 3.2: Create SQL Templates
**Folder:** `01_requirements/05_building_steps/templates/`

**Actions:**
1. Create reusable SQL templates:
   - `count-template.sql`
   - `list-template.sql`
   - `detail-template.sql`
2. Add placeholder comments
3. Document substitution points

**Example:**
```sql
/**
 * [FEATURE_NAME] Count Query
 * 
 * PURPOSE: Count total [ENTITY_PLURAL] matching search criteria
 * USED BY: GET /api/[ROUTE] (for pagination)
 * 
 * PARAMETERS:
 *   [DOCUMENT PARAMETERS]
 * 
 * RETURNS:
 *   total INT - Number of [ENTITY_PLURAL] matching criteria
 * 
 * REQUIRED INDEXES:
 *   [DOCUMENT INDEXES]
 */

SELECT COUNT(*) AS total
FROM {{SCHEMA}}.[TABLE_NAME] AS [ALIAS]
WHERE 
  ([FILTER_CONDITIONS]);
```

**Estimated Time:** 45 minutes

---

### Task 3.3: Create Feature Mappings Document
**File:** `01_requirements/05_building_steps/14_Feature_Mappings.md`

**Actions:**
1. Document all 6 features
2. List table mappings
3. List key columns
4. Document relationships
5. Note performance considerations

**Content:**
```markdown
# Feature Database Mappings

## 1. Customers ✅ IMPLEMENTED
- **Tables:** OCUSMA, OOHEAD
- **Key Columns:** OKCUNO, OKCUNM, OKPHNO
- **Performance:** ~600K records, indexed

## 2. Products (Items)
- **Tables:** MITMAS, MITFAC, MITBAL
- **Key Columns:** MMITNO, MMITDS, MMSTAT
- **Performance:** ~1M records, needs keyset pagination

[... continue for all features]
```

**Estimated Time:** 45 minutes

---

### Task 3.4: Create Implementation Order Document
**File:** `01_requirements/05_building_steps/15_Implementation_Order.md`

**Actions:**
1. Recommend implementation order
2. Note dependencies
3. Estimate time for each
4. Provide priority guidance

**Content:**
```markdown
# Feature Implementation Order

## Recommended Order:
1. ✅ Customers (DONE)
2. Products/Items (MITMAS) - HIGH PRIORITY
3. Suppliers (CIDMAS) - MEDIUM PRIORITY
4. Customer Orders (OOHEAD) - MEDIUM PRIORITY
5. Purchase Orders (MPHEAD) - LOW PRIORITY
6. Manufacturing Orders (MWOHED) - LOW PRIORITY

## Reasoning:
[Explain why this order]

## Estimated Time per Feature:
- Products: 3-4 hours
- Suppliers: 2-3 hours
- Customer Orders: 3-4 hours
- Purchase Orders: 2-3 hours
- Manufacturing Orders: 3-4 hours
```

**Estimated Time:** 30 minutes

---

## Phase 4: Testing & Validation (2-3 hours)

### Task 4.1: Run Full Test Suite
**Actions:**
1. Run all unit tests:
   ```bash
   npm run test
   ```
2. Check coverage:
   ```bash
   npm run test:coverage
   ```
3. Fix any failing tests

**Acceptance Criteria:**
- ✅ All tests pass
- ✅ Coverage > 80%
- ✅ No linter errors

**Estimated Time:** 30 minutes

---

### Task 4.2: Performance Testing
**Actions:**
1. Test customer search with various filters
2. Test with/without count mode
3. Measure query execution times
4. Check slow query logs
5. Verify correlation IDs in logs

**Test Scenarios:**
```bash
# Scenario 1: Simple search (should be fast)
curl "http://localhost:3000/api/customers?name=K&limit=25"

# Scenario 2: No count (should be faster)
curl "http://localhost:3000/api/customers?name=K&limit=25&mode=noTotal"

# Scenario 3: Pagination deep (check offset performance)
curl "http://localhost:3000/api/customers?name=K&limit=25&offset=500"
```

**Acceptance Criteria:**
- ✅ All queries < 3 seconds
- ✅ Count mode works
- ✅ No slow query warnings
- ✅ Performance acceptable

**Estimated Time:** 45 minutes

---

### Task 4.3: Integration Testing
**Actions:**
1. Test full request flow:
   - Frontend → API → Database → API → Frontend
2. Test error scenarios:
   - Invalid parameters
   - Database unavailable
   - Correlation ID tracking
3. Test health checks
4. Test graceful shutdown

**Acceptance Criteria:**
- ✅ End-to-end flow works
- ✅ Errors handled gracefully
- ✅ Health checks accurate
- ✅ Shutdown clean

**Estimated Time:** 45 minutes

---

### Task 4.4: Documentation Review
**Actions:**
1. Review all generated documentation
2. Verify SQL comments accurate
3. Check TypeScript JSDoc comments
4. Ensure templates are complete
5. Verify implementation order makes sense

**Acceptance Criteria:**
- ✅ All docs accurate
- ✅ SQL well-documented
- ✅ Types well-documented
- ✅ Templates ready to use

**Estimated Time:** 30 minutes

---

### Task 4.5: DBA Review Preparation
**Actions:**
1. Export all SQL files for DBA review
2. Create execution plan documentation
3. Document performance expectations
4. Prepare index recommendations

**Deliverable:**
```
01_requirements/05_building_steps/16_DBA_Review_Package/
  01_all_queries.sql           (Combined SQL file)
  02_execution_plans.md        (Documented plans)
  03_index_requirements.md     (Required indexes)
  04_performance_baseline.md   (Current performance)
```

**Acceptance Criteria:**
- ✅ All SQL files exported
- ✅ Execution plans documented
- ✅ Performance documented
- ✅ Ready for DBA review

**Estimated Time:** 30 minutes

---

## Summary & Success Criteria

### What We Built
1. ✅ **Core Infrastructure:**
   - Database configuration with lazy validation
   - Query loader with caching
   - Enhanced SqlClient with timing
   - Health check endpoints

2. ✅ **Customers Feature:**
   - SQL files (count.sql, list.sql)
   - TypeScript types
   - Query registry
   - Refactored repository
   - Enhanced service
   - Updated controller
   - Complete tests

3. ✅ **Reusable Templates:**
   - Feature template document
   - SQL templates
   - Feature mappings
   - Implementation order guide

4. ✅ **Quality Assurance:**
   - All tests passing
   - Performance validated
   - Documentation complete
   - DBA review ready

### Final Checklist

**Infrastructure:**
- [ ] `config.ts` created and tested
- [ ] `loadQuery.ts` created and tested
- [ ] `sqlClient.ts` enhanced and tested
- [ ] Health endpoints created and tested
- [ ] App startup sequence updated

**Customers Feature:**
- [ ] SQL files extracted and tested
- [ ] Types created
- [ ] Query registry created
- [ ] Repository refactored
- [ ] Service updated
- [ ] Controller updated
- [ ] Tests updated and passing
- [ ] Manual testing complete

**Templates:**
- [ ] Feature template documented
- [ ] SQL templates created
- [ ] Feature mappings documented
- [ ] Implementation order defined

**Quality:**
- [ ] All tests pass
- [ ] Coverage > 80%
- [ ] Performance acceptable
- [ ] Documentation complete
- [ ] DBA review package ready

---

## Next Steps After Completion

1. **Commit and push:**
   ```bash
   git add .
   git commit -m "feat: implement production-ready DAL for customers with reusable templates"
   git push
   ```

2. **Review with team:**
   - Share DBA review package
   - Demo customer search functionality
   - Review templates with team

3. **Begin next feature:**
   - Choose from: Products, Suppliers, Customer Orders
   - Follow template from Phase 3
   - Estimated 2-4 hours per feature

4. **Monitor production:**
   - Check health endpoints
   - Review slow query logs
   - Gather user feedback

---

## Appendix: Quick Reference

### File Locations
```
api/src/
  infrastructure/db/
    config.ts                 🆕
    loadQuery.ts              🆕
  infrastructure/
    sqlClient.ts              ♻️
    health.ts                 🆕
  features/customers/
    queries/
      count.sql               🆕
      list.sql                🆕
    customerQueries.ts        🆕
    customerTypes.ts          🆕
    customerRepository.ts     ♻️
    customerService.ts        ♻️
    customerRoutes.ts         ♻️
```

### Commands
```bash
# Development
npm run dev

# Testing
npm run test
npm run test:watch
npm run test:coverage

# Building
npm run build
npm start

# Health checks
curl http://localhost:3000/api/health
curl http://localhost:3000/api/health/queries
curl http://localhost:3000/api/health/db
```

### Key Decisions
- ✅ Runtime SQL loading (not build-time)
- ✅ Startup caching (zero runtime overhead)
- ✅ Optional COUNT queries (performance optimization)
- ✅ Correlation IDs (observability)
- ✅ Error masking (security)
- ✅ Per-feature organization (maintainability)

---

**END OF IMPLEMENTATION PLAN**

**Status:** READY FOR IMPLEMENTATION  
**Total Estimated Time:** 10-14 hours  
**Confidence Level:** 95% (based on expert review and existing codebase analysis)


