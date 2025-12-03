# Data Access Layer - FINAL Decision & Implementation Guide

**Date:** December 3, 2025  
**Status:** APPROVED - Ready for Implementation  
**Related Documents:**
- 11_separate_sql.md (Initial analysis)
- 11_1_security_concerns.md (Security validation)
- 11_2_DAL_critique.md (Expert critique)

---

## Executive Summary

**FINAL DECISION:** Runtime SQL file loading with multi-schema support, cached at startup.

**Architecture:** Simple utility function (40 lines) + SQL files + typed repositories.

**Why This Approach:**
- ✅ Simple (no over-engineering)
- ✅ Flexible (2+ schemas supported from day 1)
- ✅ Fast (cached at startup, zero overhead during requests)
- ✅ DBA-friendly (real .sql files they can edit and test)
- ✅ Works in Azure Web App (files deployed with code)
- ✅ Testable (every layer can be tested independently)

---

## Table of Contents

1. [Build-Time vs Runtime Decision](#1-build-time-vs-runtime-decision)
2. [Complete Architecture](#2-complete-architecture)
3. [Implementation: Step by Step](#3-implementation-step-by-step)
4. [Testing Strategy](#4-testing-strategy)
5. [Deployment Guide](#5-deployment-guide)
6. [Why Decisions Were Made](#6-why-decisions-were-made)

---

## 1. Build-Time vs Runtime Decision

### The Question

Should we:
- **Build-Time:** Generate TypeScript from SQL files during build?
- **Runtime:** Load SQL files when the app starts?

### The Answer: RUNTIME

| Factor | Build-Time | Runtime | Winner |
|--------|-----------|---------|---------|
| **Change SQL without TS rebuild?** | ❌ Must rebuild TypeScript | ✅ Edit SQL, redeploy | Runtime |
| **DBA can deploy SQL fix?** | ❌ Requires dev rebuild | ✅ Direct SQL update | Runtime |
| **Different schemas per env?** | ❌ Hardcoded at build | ✅ Environment variables | Runtime |
| **See actual SQL in repo?** | ⚠️ Generated TS files | ✅ Real .sql files | Runtime |
| **Complexity** | High (code generation) | Low (read file) | Runtime |
| **Performance** | ✅ No runtime overhead | ✅ Cached (same result) | TIE |

**Decision: Runtime loading with startup caching.**

**Why:** DBA workflow is critical. They need to optimize queries and deploy without dev involvement. Runtime with caching gives us this flexibility with zero performance penalty.

---

## 2. Complete Architecture

### 2.1. Visual Overview

```
┌─────────────────────────────────────────────────────────┐
│  React Frontend                                         │
│  - Calls REST API                                       │
│  - Knows: pagination, filters, drill-down levels       │
│  - Does NOT know: SQL, tables, schemas                 │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTP
┌─────────────────────────────────────────────────────────┐
│  Express API                                            │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Controllers → Services → Repositories             │ │
│  │ (HTTP)        (Logic)     (Data Access)           │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Data Access Layer (DAL)                                │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ SQL Files (*.sql)                                │  │
│  │ - Pure SQL with {{SCHEMA_PRIMARY}} placeholders │  │
│  │ - Documented, DBA-friendly                       │  │
│  └──────────────────────────────────────────────────┘  │
│                     ↓                                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │ loadQuery() - 40 line utility                    │  │
│  │ - Reads .sql files once at startup               │  │
│  │ - Substitutes {{SCHEMA_*}} → actual names        │  │
│  │ - Caches in memory forever                       │  │
│  └──────────────────────────────────────────────────┘  │
│                     ↓                                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │ SqlClient (Connection Pool)                      │  │
│  │ - Azure AD auth                                  │  │
│  │ - Parameterized queries                          │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Azure SQL Database                                     │
│  - PRIMARY_SCHEMA (Primary schema) - Historical data   │
│  - SECONDARY_SCHEMA (Secondary schema) - Additional    │
│  - Read-only access (db_datareader role)               │
└─────────────────────────────────────────────────────────┘
```

### 2.2. Directory Structure

```
api/
  src/
    infrastructure/
      db/
        config.ts              # Database configuration
        loadQuery.ts           # Query loader utility (40 lines)
        sqlClient.ts           # Connection pool (already exists)
        __tests__/
          loadQuery.test.ts    # Unit tests
    
    features/
      customers/
        queries/               # SQL files folder
          list.sql             # Customer list (primary schema only)
          list-with-external.sql  # With secondary schema join
          count.sql            # Count for pagination
          detail.sql           # Customer detail with external data
          orders-list.sql      # Orders drilldown
        customerQueries.ts     # Query registry (imports SQL files)
        customerTypes.ts       # TypeScript types
        customerRepository.ts  # Data access methods
        customerService.ts     # Business logic
        customerController.ts  # HTTP handlers
        __tests__/
          customerRepository.test.ts
          customerService.test.ts
      
      orders/
        # Same structure...
      
      suppliers/
        # Same structure...
```

---

## 3. Implementation: Step by Step

### Phase 0: Prerequisites (5 minutes)

**Verify you have:**
- Node.js 18+
- TypeScript configured
- Azure SQL connection working
- Environment variables setup

---

### Phase 1: Core Infrastructure (1 hour)

#### Step 1.1: Database Configuration

**File:** `api/src/infrastructure/db/config.ts`

**Purpose:** Central configuration for database schemas and connection.

**Why:** Single source of truth for all database configuration. Easy to change schemas per environment.

```typescript
/**
 * Database Configuration
 * 
 * WHY: Centralized database configuration
 * - All schemas defined in one place
 * - Easy to change per environment (dev/test/prod)
 * - Type-safe access to configuration
 * 
 * Environment Variables Required:
 * - DB_SCHEMA_PRIMARY: Main historical data schema (default: PRIMARY_SCHEMA)
 * - DB_SCHEMA_SECONDARY: Additional data schema (default: SECONDARY_SCHEMA)
 * - DB_SERVER: Azure SQL server hostname
 * - DB_NAME: Database name
 */

export const DatabaseConfig = {
  /**
   * Database schemas
   * WHY: Support for multiple schemas from day 1
   * - Primary: Main historical data
   * - Secondary: Additional/external data
   */
  schemas: {
    primary: process.env.DB_SCHEMA_PRIMARY || 'PRIMARY_SCHEMA',
    secondary: process.env.DB_SCHEMA_SECONDARY || 'SECONDARY_SCHEMA',
  },
  
  /**
   * Connection details
   * WHY: Read from environment for security and flexibility
   */
  connection: {
    server: process.env.DB_SERVER || '',
    database: process.env.DB_NAME || '',
  },
  
  /**
   * Query execution limits
   * WHY: Protect against accidentally fetching too much data
   * - Large database, must always paginate
   */
  limits: {
    maxPageSize: 100,        // Never return more than 100 items
    defaultPageSize: 25,     // Default if client doesn't specify
    queryTimeout: 30000,     // 30 seconds max per query
  },
} as const;

/**
 * Validation on module load
 * WHY: Fail fast if configuration is missing
 * Better to crash at startup than during user request
 */
if (!DatabaseConfig.connection.server || !DatabaseConfig.connection.database) {
  throw new Error(
    'Database configuration missing. Required: DB_SERVER, DB_NAME'
  );
}
```

**Test it:**
```bash
# Verify environment variables
echo $DB_SCHEMA_PRIMARY
echo $DB_SCHEMA_SECONDARY
```

**Acceptance criteria:**
- ✅ File compiles
- ✅ Throws error if DB_SERVER missing
- ✅ Returns correct schema names from env vars

---

#### Step 1.2: Query Loader Utility

**File:** `api/src/infrastructure/db/loadQuery.ts`

**Purpose:** Load SQL files, substitute schema placeholders, cache results.

**Why:** This is the heart of the architecture. Simple utility that makes everything else possible.

```typescript
/**
 * Query Loader Utility
 * 
 * PURPOSE: Load SQL query files with schema substitution
 * 
 * WHY THIS EXISTS:
 * - Keeps SQL in .sql files (DBA-friendly, tooling works)
 * - Supports multiple schemas (primary + secondary)
 * - Caches loaded queries (zero runtime overhead)
 * - Validates all placeholders are replaced (fail fast)
 * 
 * HOW IT WORKS:
 * 1. Called when query registry module loads (once per query)
 * 2. Reads .sql file from disk
 * 3. Replaces {{PLACEHOLDER}} with actual schema names
 * 4. Caches result in memory
 * 5. Returns cached string for all subsequent requests
 * 
 * PERFORMANCE:
 * - File I/O happens ONCE (at startup)
 * - All requests use cached strings
 * - Zero overhead during request handling
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * In-memory cache
 * WHY: Queries never change during app lifetime
 * - Loaded once at startup
 * - Reused for all requests
 * - No need for TTL or invalidation
 */
const queryCache = new Map<string, string>();

/**
 * Load a SQL query file with schema substitution
 * 
 * @param relativePath - Path from src/ directory to .sql file
 *                       Example: 'features/customers/queries/list.sql'
 * 
 * @param schemas - Schema name(s) to substitute in the SQL
 *                  Can be:
 *                  - Single schema: { SCHEMA: 'PRIMARY_SCHEMA' }
 *                  - Multiple schemas: { SCHEMA_PRIMARY: 'PRIMARY_SCHEMA', SCHEMA_SECONDARY: 'SECONDARY_SCHEMA' }
 * 
 * @returns SQL query string with schemas substituted
 * 
 * @throws Error if file not found or placeholders not replaced
 * 
 * WHY PARAMETERS:
 * - relativePath: Makes it easy to find the SQL file in the codebase
 * - schemas: Flexible - supports single or multiple schema scenarios
 * 
 * EXAMPLE USAGE:
 * ```typescript
 * // Single schema
 * const sql = loadQuery('features/customers/queries/list.sql', {
 *   SCHEMA: 'PRIMARY_SCHEMA'
 * });
 * 
 * // Multiple schemas
 * const sql = loadQuery('features/customers/queries/detail.sql', {
 *   SCHEMA_PRIMARY: 'PRIMARY_SCHEMA',
 *   SCHEMA_SECONDARY: 'SECONDARY_SCHEMA'
 * });
 * ```
 */
export function loadQuery(
  relativePath: string,
  schemas: Record<string, string>
): string {
  // Create cache key from path + schemas
  // WHY: Different schema combinations might use same file
  // Example: dev uses test schemas, prod uses prod schemas
  const cacheKey = `${relativePath}:${JSON.stringify(schemas)}`;
  
  // Check cache first
  // WHY: Avoid repeated file I/O and string processing
  if (queryCache.has(cacheKey)) {
    return queryCache.get(cacheKey)!;
  }
  
  try {
    // Read SQL file from disk
    // WHY __dirname: Works in both development and deployed environments
    // WHY '../..': Go up from infrastructure/db/ to src/
    const absolutePath = join(__dirname, '../..', relativePath);
    let sql = readFileSync(absolutePath, 'utf-8');
    
    // Replace each schema placeholder
    // WHY loop: Support multiple schemas in same query
    // WHY regex with \\{\\{: Escape braces, global replace
    for (const [placeholder, schemaName] of Object.entries(schemas)) {
      const pattern = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
      sql = sql.replace(pattern, schemaName);
    }
    
    // Validate: ensure ALL placeholders were replaced
    // WHY: Better to fail at startup than have broken SQL at runtime
    // Example of what we catch: {{SCHEMA_TYPO}} not in schemas object
    if (sql.match(/\{\{[A-Z_]+\}\}/)) {
      const unreplaced = sql.match(/\{\{([A-Z_]+)\}\}/);
      throw new Error(
        `Unreplaced placeholder {{${unreplaced?.[1]}}} in ${relativePath}.\n` +
        `Available schemas: ${Object.keys(schemas).join(', ')}\n` +
        `Tip: Check your SQL file has correct placeholder names.`
      );
    }
    
    // Cache the result
    // WHY: Query strings never change, safe to cache forever
    queryCache.set(cacheKey, sql);
    
    // Log for visibility during startup
    // WHY: Helps debug which queries are loaded and when
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[QueryLoader] Loaded: ${relativePath}`);
    }
    
  } catch (error) {
    // Provide helpful error message
    // WHY: Make debugging easy when SQL files are missing or malformed
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `SQL file not found: ${relativePath}\n` +
        `Make sure the file exists and the path is correct.\n` +
        `Tip: Paths are relative to src/ directory.`
      );
    }
    throw error;
  }
  
  return queryCache.get(cacheKey)!;
}

/**
 * Clear cache (for testing only)
 * 
 * WHY: Tests need to reload queries to test different scenarios
 * Production never calls this - queries stay cached
 */
export function clearQueryCache(): void {
  queryCache.clear();
}

/**
 * Get cache statistics (for monitoring)
 * 
 * WHY: Useful to verify all queries are loaded at startup
 * Can expose as health check endpoint
 */
export function getQueryCacheStats() {
  return {
    size: queryCache.size,
    queries: Array.from(queryCache.keys()),
  };
}
```

**Test it:**

Create test file: `api/src/infrastructure/db/__tests__/loadQuery.test.ts`

```typescript
import { loadQuery, clearQueryCache } from '../loadQuery';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('loadQuery', () => {
  const testDir = join(__dirname, '../../../test-queries');
  const testFile = 'test-queries/simple.sql';
  
  beforeAll(() => {
    // Create test SQL file
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      join(__dirname, '../../../', testFile),
      'SELECT * FROM {{SCHEMA}}.CUSTOMERS WHERE customer_id = @customerId;'
    );
  });
  
  beforeEach(() => {
    clearQueryCache();
  });
  
  it('should load SQL file and replace schema', () => {
    const sql = loadQuery(testFile, { SCHEMA: 'PRIMARY_SCHEMA' });
    
    expect(sql).toContain('PRIMARY_SCHEMA');
    expect(sql).not.toContain('{{SCHEMA}}');
  });
  
  it('should cache loaded queries', () => {
    const sql1 = loadQuery(testFile, { SCHEMA: 'PRIMARY_SCHEMA' });
    const sql2 = loadQuery(testFile, { SCHEMA: 'PRIMARY_SCHEMA' });
    
    // Same reference = cached
    expect(sql1).toBe(sql2);
  });
  
  it('should support multiple schemas', () => {
    writeFileSync(
      join(__dirname, '../../../', testFile),
      'SELECT * FROM {{SCHEMA_PRIMARY}}.Table1 JOIN {{SCHEMA_SECONDARY}}.Table2'
    );
    
    const sql = loadQuery(testFile, {
      SCHEMA_PRIMARY: 'PRIMARY_SCHEMA',
      SCHEMA_SECONDARY: 'SECONDARY_SCHEMA',
    });
    
    expect(sql).toContain('PRIMARY_SCHEMA');
    expect(sql).toContain('SECONDARY_SCHEMA');
    expect(sql).not.toContain('{{');
  });
  
  it('should throw error for missing file', () => {
    expect(() => {
      loadQuery('does-not-exist.sql', { SCHEMA: 'PRIMARY_SCHEMA' });
    }).toThrow('SQL file not found');
  });
  
  it('should throw error for unreplaced placeholders', () => {
    writeFileSync(
      join(__dirname, '../../../', testFile),
      'SELECT * FROM {{SCHEMA_TYPO}}.Table'
    );
    
    expect(() => {
      loadQuery(testFile, { SCHEMA: 'PRIMARY_SCHEMA' });
    }).toThrow('Unreplaced placeholder');
  });
});
```

**Run tests:**
```bash
npm test -- loadQuery.test.ts
```

**Acceptance criteria:**
- ✅ Loads SQL file from disk
- ✅ Replaces single schema placeholder
- ✅ Replaces multiple schema placeholders
- ✅ Caches results
- ✅ Throws clear error for missing file
- ✅ Throws clear error for unreplaced placeholders
- ✅ All tests pass

**WAIT FOR APPROVAL before proceeding to Phase 2**

---

### Phase 2: First Feature - Customer (4 hours)

#### Step 2.1: Create SQL Files

**Purpose:** Extract existing SQL into proper .sql files with documentation.

**Why:** Makes SQL accessible to DBAs, enables tooling, separates concerns.

---

**File:** `api/src/features/customers/queries/count.sql`

**Why this file:** Pagination requires knowing total count. Separate query for performance.

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
 * WHY NO JOINS:
 * - Count query should be fast
 * - Filters only on customer table
 * - Separate from data query for flexibility
 */

SELECT COUNT(*) AS total
FROM {{SCHEMA}}.CUSTOMERS AS cust
WHERE 
  (@namePattern IS NULL OR cust.customer_name LIKE @namePattern)
  AND (@customerNumber IS NULL OR cust.customer_id = @customerNumber)
  AND (@phone IS NULL OR cust.phone = @phone);
```

---

**File:** `api/src/features/customers/queries/list.sql`

**Why this file:** Main customer list view. Single schema for simplicity.

```sql
/**
 * Customer List Query (Primary Schema Only)
 * 
 * PURPOSE: Display paginated list of customers with order counts
 * USED BY: GET /api/customers
 * DRILL-DOWN: User clicks customer → detail.sql
 * 
 * PARAMETERS:
 *   @namePattern NVARCHAR - Customer name filter with wildcards (e.g., '%Acme%')
 *   @customerNumber NVARCHAR - Exact customer number match
 *   @phone NVARCHAR - Phone number filter
 *   @offset INT - Pagination offset (e.g., 0, 25, 50)
 *   @limit INT - Page size (max 100, enforced by repository)
 * 
 * RETURNS:
 *   customerNumber NVARCHAR - Unique customer identifier
 *   customerName NVARCHAR - Customer name
 *   phone NVARCHAR - Phone number
 *   orderCount INT - Total orders for this customer
 * 
 * PERFORMANCE NOTES:
 *   - Uses index on customer_name for name search (LIKE)
 *   - LEFT JOIN to ORDERS uses index on customer_id
 *   - GROUP BY required for COUNT aggregation
 *   - OFFSET/FETCH handles pagination efficiently
 * 
 * REQUIRED INDEXES:
 *   - CUSTOMERS: customer_id (PK), customer_name (for LIKE search)
 *   - ORDERS: customer_id (FK to customer)
 * 
 * WHY THIS STRUCTURE:
 * - Simple list view doesn't need secondary schema
 * - Order count is useful preview before drill-down
 * - Pagination mandatory for large datasets
 */

SELECT 
  cust.customer_id AS customerNumber,
  cust.customer_name AS customerName,
  cust.phone AS phone,
  COUNT(DISTINCT ord.order_id) AS orderCount
FROM {{SCHEMA}}.CUSTOMERS AS cust
LEFT JOIN {{SCHEMA}}.ORDERS AS ord 
  ON ord.customer_id = cust.customer_id
WHERE 
  (@namePattern IS NULL OR cust.customer_name LIKE @namePattern)
  AND (@customerNumber IS NULL OR cust.customer_id = @customerNumber)
  AND (@phone IS NULL OR cust.phone = @phone)
GROUP BY 
  cust.customer_id, 
  cust.customer_name, 
  cust.phone
ORDER BY cust.customer_name
OFFSET @offset ROWS 
FETCH NEXT @limit ROWS ONLY;
```

---

**File:** `api/src/features/customers/queries/detail.sql`

**Why this file:** Customer detail with external data. Uses TWO schemas.

```sql
/**
 * Customer Detail Query (Two Schemas)
 * 
 * PURPOSE: Display complete customer information with external data
 * USED BY: GET /api/customers/:id
 * PREVIOUS: User clicked from list.sql
 * NEXT DRILL-DOWN: orders-list.sql (customer's orders)
 * 
 * PARAMETERS:
 *   @customerNumber NVARCHAR - Customer number (required)
 * 
 * RETURNS:
 *   -- Primary schema fields
 *   customerNumber NVARCHAR
 *   customerName NVARCHAR
 *   phone NVARCHAR
 *   vat NVARCHAR
 *   address1 NVARCHAR
 *   address2 NVARCHAR
 *   city NVARCHAR
 *   postalCode NVARCHAR
 *   country NVARCHAR
 *   
 *   -- Secondary schema fields
 *   additionalField1 NVARCHAR
 *   additionalField2 NVARCHAR
 *   
 *   -- Aggregated fields
 *   orderCount INT
 *   totalOrderValue DECIMAL
 *   latestOrderDate DATE
 *   firstOrderDate DATE
 * 
 * WHY TWO SCHEMAS:
 * - Primary: Core historical customer data
 * - Secondary: Additional/external customer data
 * - Join at query level for performance (vs app-level join)
 * 
 * PERFORMANCE NOTES:
 *   - Single customer lookup by PK (very fast)
 *   - External data joined by customer number (indexed)
 *   - Order aggregations use indexed customer_id
 * 
 * WHY NO PAGINATION:
 * - Single customer detail, not a list
 * - Aggregations are summaries, not full datasets
 */

SELECT 
  -- Core customer data (primary schema)
  cust.customer_id AS customerNumber,
  cust.customer_name AS customerName,
  cust.phone AS phone,
  cust.vat_number AS vat,
  cust.address_line1 AS address1,
  cust.address_line2 AS address2,
  cust.city AS city,
  cust.postal_code AS postalCode,
  cust.country AS country,
  
  -- External/additional data (secondary schema)
  ext.additional_field_1 AS additionalField1,
  ext.additional_field_2 AS additionalField2,
  
  -- Aggregated order statistics (primary schema)
  COUNT(DISTINCT ord.order_id) AS orderCount,
  SUM(ord.order_total) AS totalOrderValue,
  MAX(ord.order_date) AS latestOrderDate,
  MIN(ord.order_date) AS firstOrderDate

FROM {{SCHEMA_PRIMARY}}.CUSTOMERS AS cust

-- Join to secondary schema for additional data
LEFT JOIN {{SCHEMA_SECONDARY}}.CUSTOMER_EXTENSIONS AS ext
  ON ext.customer_id = cust.customer_id

-- Join to orders for statistics (primary schema)
LEFT JOIN {{SCHEMA_PRIMARY}}.ORDERS AS ord 
  ON ord.customer_id = cust.customer_id

WHERE cust.customer_id = @customerNumber

GROUP BY 
  cust.customer_id, cust.customer_name, cust.phone, cust.vat_number,
  cust.address_line1, cust.address_line2, cust.city, cust.postal_code, cust.country,
  ext.additional_field_1, ext.additional_field_2;
```

---

**File:** `api/src/features/customers/queries/orders-list.sql`

**Why this file:** First drill-down level - customer's orders.

```sql
/**
 * Customer Orders List (Drill-Down Level 1)
 * 
 * PURPOSE: Display all orders for a specific customer
 * USED BY: GET /api/customers/:id/orders
 * PREVIOUS: User viewing detail.sql, clicked "Orders" tab
 * NEXT DRILL-DOWN: order-items.sql (items in specific order)
 * 
 * PARAMETERS:
 *   @customerNumber NVARCHAR - Customer number (required)
 *   @offset INT - Pagination offset
 *   @limit INT - Page size
 * 
 * RETURNS:
 *   orderNumber NVARCHAR - Order identifier
 *   customerOrderRef NVARCHAR - Customer's reference number
 *   orderDate DATE - When order was placed
 *   orderStatus NVARCHAR - Current status
 *   deliveryDate DATE - Expected/actual delivery
 *   itemCount INT - Number of line items
 *   orderTotal DECIMAL - Total order value
 * 
 * WHY PAGINATED:
 * - Customers might have thousands of orders
 * - Must paginate even drill-downs
 * 
 * WHY GROUP BY:
 * - Need to count items and sum totals per order
 * - More efficient than separate queries
 */

SELECT 
  ord.order_id AS orderNumber,
  ord.customer_order_ref AS customerOrderRef,
  ord.order_date AS orderDate,
  ord.order_status AS orderStatus,
  ord.delivery_date AS deliveryDate,
  COUNT(DISTINCT line.item_id) AS itemCount,
  SUM(line.quantity * line.unit_price) AS orderTotal
FROM {{SCHEMA}}.ORDERS AS ord
LEFT JOIN {{SCHEMA}}.ORDER_LINES AS line 
  ON line.order_id = ord.order_id
WHERE ord.customer_id = @customerNumber
GROUP BY 
  ord.order_id, ord.customer_order_ref, ord.order_date, 
  ord.order_status, ord.delivery_date
ORDER BY ord.order_date DESC
OFFSET @offset ROWS 
FETCH NEXT @limit ROWS ONLY;
```

**Test SQL files:**

```bash
# Open each file in Azure Data Studio
# Replace {{SCHEMA}} or {{SCHEMA_PRIMARY}}/{{SCHEMA_SECONDARY}} with actual values
# Run query and verify:
# 1. No syntax errors
# 2. Returns expected data
# 3. Performance is acceptable (< 3 seconds)
# 4. Execution plan shows index usage
```

**Acceptance criteria:**
- ✅ All SQL files are syntactically valid
- ✅ All queries tested in Azure Data Studio
- ✅ Performance acceptable (< 3 seconds)
- ✅ Documentation complete
- ✅ Execution plans reviewed

**WAIT FOR APPROVAL before proceeding to Step 2.2**

---

#### Step 2.2: Create Query Registry

**File:** `api/src/features/customers/customerQueries.ts`

**Purpose:** Load all SQL files once, make them available as constants.

**Why:** Queries loaded at startup, cached forever. Zero overhead during requests.

```typescript
/**
 * Customer Query Registry
 * 
 * PURPOSE: Load and export all customer-related SQL queries
 * 
 * WHY THIS FILE:
 * - Single place to see all queries for customer feature
 * - Queries loaded once when module imports
 * - Cached and reused for all requests
 * 
 * HOW IT WORKS:
 * 1. Module is imported by customerRepository
 * 2. loadQuery() runs for each query (reads SQL files)
 * 3. Results cached in memory
 * 4. Subsequent imports reuse same cached queries
 * 
 * PERFORMANCE:
 * - File I/O happens once (when first imported)
 * - All requests use cached strings
 * - Zero overhead after initial load
 */

import { loadQuery } from '../../infrastructure/db/loadQuery';
import { DatabaseConfig } from '../../infrastructure/db/config';

// Destructure schemas for convenience
// WHY: Makes query definitions cleaner below
const { primary, secondary } = DatabaseConfig.schemas;

/**
 * Customer Queries
 * 
 * WHY const: Queries never change at runtime
 * WHY as const: Makes TypeScript treat as literal types (better type safety)
 * 
 * NAMING CONVENTION:
 * - ALL_CAPS for SQL query constants
 * - Descriptive name matching SQL file purpose
 * 
 * SCHEMA USAGE:
 * - Single schema queries: { SCHEMA: primary }
 * - Multi-schema queries: { SCHEMA_PRIMARY: primary, SCHEMA_SECONDARY: secondary }
 */
export const CustomerQueries = {
  
  /**
   * Count customers matching criteria
   * 
   * File: features/customers/queries/count.sql
   * Schemas: Primary only
   * Used by: search() for pagination
   * 
   * WHY SEPARATE FROM LIST:
   * - Count query can be optimized differently
   * - Don't need to fetch data just to count
   */
  COUNT: loadQuery(
    'features/customers/queries/count.sql',
    { SCHEMA: primary }
  ),
  
  /**
   * Customer list with order counts
   * 
   * File: features/customers/queries/list.sql
   * Schemas: Primary only
   * Used by: search() for data
   * Pagination: OFFSET/FETCH in SQL
   * 
   * WHY PRIMARY ONLY:
   * - List view doesn't need external data
   * - Simpler query = faster performance
   * - Can add external data later if needed
   */
  LIST: loadQuery(
    'features/customers/queries/list.sql',
    { SCHEMA: primary }
  ),
  
  /**
   * Customer detail with external data
   * 
   * File: features/customers/queries/detail.sql
   * Schemas: Primary + Secondary (TWO schemas)
   * Used by: getDetail()
   * 
   * WHY TWO SCHEMAS:
   * - Customer extensions stored in secondary schema
   * - Join at DB level for performance
   * - Single query more efficient than app-level join
   */
  DETAIL: loadQuery(
    'features/customers/queries/detail.sql',
    {
      SCHEMA_PRIMARY: primary,
      SCHEMA_SECONDARY: secondary,
    }
  ),
  
  /**
   * Customer orders (drill-down level 1)
   * 
   * File: features/customers/queries/orders-list.sql
   * Schemas: Primary only
   * Used by: getOrders()
   * Pagination: OFFSET/FETCH in SQL
   * 
   * WHY PAGINATED:
   * - Customer might have thousands of orders
   * - Always paginate, even drill-downs
   */
  ORDERS: loadQuery(
    'features/customers/queries/orders-list.sql',
    { SCHEMA: primary }
  ),
  
} as const;

/**
 * Query Metadata
 * 
 * WHY: Documentation and tooling support
 * - Helps developers understand query hierarchy
 * - Can be used for automated documentation
 * - Useful for debugging and monitoring
 * 
 * NOT USED AT RUNTIME: Just for documentation
 */
export const CustomerQueryMetadata = {
  COUNT: {
    file: 'count.sql',
    purpose: 'Count customers for pagination',
    schemas: ['primary'],
    route: 'GET /api/customers',
  },
  LIST: {
    file: 'list.sql',
    purpose: 'Customer list view',
    schemas: ['primary'],
    route: 'GET /api/customers',
    drilldown: 'Click customer → DETAIL',
  },
  DETAIL: {
    file: 'detail.sql',
    purpose: 'Customer detail with external data',
    schemas: ['primary', 'secondary'],
    route: 'GET /api/customers/:id',
    drilldown: 'Click orders → ORDERS',
  },
  ORDERS: {
    file: 'orders-list.sql',
    purpose: 'Customer orders (drill-down)',
    schemas: ['primary'],
    route: 'GET /api/customers/:id/orders',
  },
} as const;
```

**Test it:**

```typescript
// api/src/features/customers/__tests__/customerQueries.test.ts
import { CustomerQueries } from '../customerQueries';

describe('CustomerQueries', () => {
  it('should load all queries', () => {
    expect(CustomerQueries.COUNT).toBeDefined();
    expect(CustomerQueries.LIST).toBeDefined();
    expect(CustomerQueries.DETAIL).toBeDefined();
    expect(CustomerQueries.ORDERS).toBeDefined();
  });
  
  it('should have schema substituted', () => {
    // Check that placeholders are replaced
    expect(CustomerQueries.LIST).not.toContain('{{SCHEMA}}');
    expect(CustomerQueries.DETAIL).not.toContain('{{SCHEMA_PRIMARY}}');
    expect(CustomerQueries.DETAIL).not.toContain('{{SCHEMA_SECONDARY}}');
  });
  
  it('should contain expected SQL keywords', () => {
    expect(CustomerQueries.LIST).toContain('SELECT');
    expect(CustomerQueries.LIST).toContain('FROM');
    expect(CustomerQueries.LIST).toContain('PRIMARY_SCHEMA'); // Schema substituted
  });
  
  it('should have detail query with both schemas', () => {
    // Detail query uses two schemas
    const detailQuery = CustomerQueries.DETAIL;
    
    // Should have both schemas (count occurrences)
    const primaryCount = (detailQuery.match(/PRIMARY_SCHEMA/g) || []).length;
    const secondaryCount = (detailQuery.match(/SECONDARY_SCHEMA/g) || []).length;
    
    expect(primaryCount).toBeGreaterThan(0);
    expect(secondaryCount).toBeGreaterThan(0);
  });
});
```

**Run tests:**
```bash
npm test -- customerQueries.test.ts
```

**Acceptance criteria:**
- ✅ All queries load without error
- ✅ Schemas are substituted correctly
- ✅ Tests pass
- ✅ No SQL syntax errors
- ✅ Detail query has both schemas

**WAIT FOR APPROVAL before proceeding to Step 2.3**

---

#### Step 2.3: Create TypeScript Types

**File:** `api/src/features/customers/customerTypes.ts`

**Purpose:** Type-safe contracts for all customer data structures.

**Why:** Type safety prevents bugs. Documents data structure. Enables IDE autocomplete.

```typescript
/**
 * Customer Types
 * 
 * PURPOSE: TypeScript types for customer data structures
 * 
 * WHY:
 * - Type safety prevents bugs
 * - Documents expected data structure
 * - Enables IDE autocomplete
 * - Makes refactoring safer
 * 
 * NAMING CONVENTIONS:
 * - *Criteria: Input parameters for searches
 * - *Item: Single item in a list
 * - *Detail: Complete detail view
 * - PagedResult<T>: List with pagination info
 */

/**
 * Customer search criteria
 * WHY: Type-safe parameters for search operations
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
 * WHY: Matches SQL query output exactly
 */
export type CustomerListItem = {
  /** Unique customer identifier */
  customerNumber: string;
  
  /** Customer name */
  customerName: string;
  
  /** Phone number (nullable in DB) */
  phone: string | null;
  
  /** Total orders for this customer */
  orderCount: number;
};

/**
 * Customer detail (from detail.sql)
 * WHY: Includes fields from BOTH schemas
 */
export type CustomerDetail = {
  // Primary schema fields
  customerNumber: string;
  customerName: string;
  phone: string | null;
  vat: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  
  // Secondary schema fields
  additionalField1: string | null;
  additionalField2: string | null;
  
  // Aggregated fields
  orderCount: number;
  totalOrderValue: number | null;
  latestOrderDate: string | null;  // ISO date string
  firstOrderDate: string | null;   // ISO date string
};

/**
 * Customer order (from orders-list.sql)
 * WHY: Single order in customer's order list
 */
export type CustomerOrder = {
  orderNumber: string;
  customerOrderRef: string | null;
  orderDate: string | null;         // ISO date string
  orderStatus: string | null;
  deliveryDate: string | null;      // ISO date string
  itemCount: number;
  orderTotal: number | null;
};

/**
 * Generic pagination info
 * WHY: Reusable across all features
 */
export type PageInfo = {
  offset: number;
  limit: number;
};

/**
 * Generic paginated result
 * WHY: Consistent pagination structure
 */
export type PagedResult<T> = {
  /** Array of items */
  items: T[];
  
  /** Total count (for pagination UI) */
  total: number;
  
  /** Current page info */
  page: PageInfo;
};
```

**Test it:**

```typescript
// Verify types compile
import { CustomerListItem, CustomerDetail, PagedResult } from '../customerTypes';

// This should compile without errors
const item: CustomerListItem = {
  customerNumber: 'C001',
  customerName: 'Acme Corp',
  phone: '+123456789',
  orderCount: 42,
};

const result: PagedResult<CustomerListItem> = {
  items: [item],
  total: 100,
  page: { offset: 0, limit: 25 },
};
```

**Acceptance criteria:**
- ✅ File compiles
- ✅ Types match SQL query outputs
- ✅ All nullable fields marked correctly
- ✅ Generic types (PagedResult) reusable

**WAIT FOR APPROVAL before proceeding to Step 2.4**

---

#### Step 2.4: Create Repository

**File:** `api/src/features/customers/customerRepository.ts`

**Purpose:** Data access layer. Execute queries, return typed results.

**Why:** Separates data access from business logic. Single responsibility. Testable.

```typescript
/**
 * Customer Repository
 * 
 * PURPOSE: Data access layer for customer operations
 * 
 * RESPONSIBILITIES:
 * - Execute SQL queries via SqlClient
 * - Map database results to TypeScript types
 * - Handle pagination
 * - Return typed results
 * 
 * DOES NOT:
 * - Contain business logic (that's in Service)
 * - Handle HTTP concerns (that's in Controller)
 * - Know about authentication (handled by middleware)
 * 
 * WHY THIS LAYER:
 * - Separates data access from business logic
 * - Easy to test (mock SqlClient)
 * - Easy to swap data source (if needed)
 * - Single responsibility principle
 */

import { SqlClient } from '../../infrastructure/sqlClient';
import { DatabaseConfig } from '../../infrastructure/db/config';
import { CustomerQueries } from './customerQueries';
import {
  CustomerSearchCriteria,
  CustomerListItem,
  CustomerDetail,
  CustomerOrder,
  PagedResult,
} from './customerTypes';

/**
 * Max page size limit
 * WHY: Prevent accidentally fetching too much data
 * - Large database
 * - Must protect against abuse
 * - Enforce at repository level (closest to data)
 */
const MAX_PAGE_SIZE = DatabaseConfig.limits.maxPageSize;

export class CustomerRepository {
  /**
   * Constructor
   * 
   * WHY dependency injection:
   * - Easy to test (can inject mock client)
   * - Follows SOLID principles
   * - Client lifecycle managed by caller
   */
  constructor(private readonly client: SqlClient) {}
  
  /**
   * Search customers with pagination
   * 
   * @param criteria - Search filters and pagination
   * @returns Paginated list of customers
   * 
   * WHY TWO QUERIES:
   * - COUNT query: Get total for pagination
   * - LIST query: Get actual data
   * - Could be one query but separate is more flexible
   * 
   * PERFORMANCE:
   * - Both queries use indexes
   * - Count is fast (no joins needed)
   * - List is paginated (never returns all data)
   */
  async search(
    criteria: CustomerSearchCriteria
  ): Promise<PagedResult<CustomerListItem>> {
    // Prepare parameters
    // WHY: Consistent parameter structure for both queries
    const params = {
      namePattern: criteria.name ? `%${criteria.name}%` : null,
      customerNumber: criteria.customerNumber ?? null,
      phone: criteria.phone ?? null,
      offset: criteria.offset,
      // Enforce max page size
      // WHY: Prevent abuse, protect database and network
      limit: Math.min(criteria.limit, MAX_PAGE_SIZE),
    };
    
    // Execute count query
    // WHY: Need total for pagination UI (page X of Y)
    const [countRow] = await this.client.query<{ total: number }>(
      CustomerQueries.COUNT,
      params
    );
    const total = countRow?.total ?? 0;
    
    // Execute data query
    // WHY: Separate from count for flexibility
    // Could skip if total is 0, but usually not worth the complexity
    const items = await this.client.query<CustomerListItem>(
      CustomerQueries.LIST,
      params
    );
    
    // Return paginated result
    // WHY structured format: Consistent across all repositories
    return {
      items,
      total,
      page: {
        offset: criteria.offset,
        limit: params.limit,
      },
    };
  }
  
  /**
   * Get customer detail by number
   * 
   * @param customerNumber - Unique customer identifier
   * @returns Customer detail or null if not found
   * 
   * WHY NULL:
   * - Not found is valid scenario (not an error)
   * - Caller decides how to handle (404, redirect, etc.)
   * 
   * WHY TWO SCHEMAS:
   * - Query joins primary + secondary schemas
   * - Gets all data in one trip to database
   * - More efficient than separate queries
   */
  async getDetail(customerNumber: string): Promise<CustomerDetail | null> {
    // Single query, returns 0 or 1 row
    // WHY array destructuring: Query always returns array
    const [detail] = await this.client.query<CustomerDetail>(
      CustomerQueries.DETAIL,
      { customerNumber }
    );
    
    // Return null if not found
    // WHY: Clearer than undefined, explicit "no data"
    return detail ?? null;
  }
  
  /**
   * Get customer orders (drill-down)
   * 
   * @param customerNumber - Customer identifier
   * @param offset - Pagination offset
   * @param limit - Page size
   * @returns List of orders for customer
   * 
   * WHY PAGINATED:
   * - Customer might have thousands of orders
   * - Even drill-downs must paginate
   * 
   * WHY NO TOTAL COUNT:
   * - Often not needed for drill-downs
   * - Can add separate count query if needed
   * - Trade-off: simplicity vs complete pagination
   */
  async getOrders(
    customerNumber: string,
    offset: number,
    limit: number
  ): Promise<CustomerOrder[]> {
    // Enforce max page size
    const safeLimit = Math.min(limit, MAX_PAGE_SIZE);
    
    // Execute query
    // WHY: Returns array directly, no total count
    return this.client.query<CustomerOrder>(
      CustomerQueries.ORDERS,
      {
        customerNumber,
        offset,
        limit: safeLimit,
      }
    );
  }
}
```

**Test it:**

```typescript
// api/src/features/customers/__tests__/customerRepository.test.ts
import { CustomerRepository } from '../customerRepository';
import { SqlClient } from '../../../infrastructure/sqlClient';

/**
 * WHY MOCK:
 * - Unit tests shouldn't hit real database
 * - Tests must be fast and reliable
 * - Focus on repository logic, not database
 */
describe('CustomerRepository', () => {
  let repository: CustomerRepository;
  let mockClient: jest.Mocked<SqlClient>;
  
  beforeEach(() => {
    // Create mock client
    // WHY: Simulates database without actual connection
    mockClient = {
      query: jest.fn(),
    } as any;
    
    repository = new CustomerRepository(mockClient);
  });
  
  describe('search', () => {
    it('should return paginated results', async () => {
      // Arrange: Setup mock responses
      mockClient.query
        .mockResolvedValueOnce([{ total: 150 }])  // COUNT query
        .mockResolvedValueOnce([                   // LIST query
          {
            customerNumber: 'C001',
            customerName: 'Acme Corp',
            phone: '+123',
            orderCount: 10,
          },
        ]);
      
      // Act: Call repository method
      const result = await repository.search({
        name: 'Acme',
        offset: 0,
        limit: 25,
      });
      
      // Assert: Verify results
      expect(result.total).toBe(150);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].customerName).toBe('Acme Corp');
      expect(mockClient.query).toHaveBeenCalledTimes(2); // COUNT + LIST
    });
    
    it('should enforce max page size', async () => {
      mockClient.query
        .mockResolvedValueOnce([{ total: 100 }])
        .mockResolvedValueOnce([]);
      
      // Try to request 200 items (over limit of 100)
      await repository.search({
        offset: 0,
        limit: 200, // Over MAX_PAGE_SIZE
      });
      
      // Verify limit was clamped to 100
      const listQueryCall = mockClient.query.mock.calls[1];
      expect(listQueryCall[1].limit).toBe(100);
    });
    
    it('should handle name pattern correctly', async () => {
      mockClient.query
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([]);
      
      await repository.search({
        name: 'Acme',
        offset: 0,
        limit: 25,
      });
      
      // Verify name was wrapped with % for LIKE
      const countQueryCall = mockClient.query.mock.calls[0];
      expect(countQueryCall[1].namePattern).toBe('%Acme%');
    });
  });
  
  describe('getDetail', () => {
    it('should return customer detail', async () => {
      const mockDetail = {
        customerNumber: 'C001',
        customerName: 'Acme Corp',
        phone: '+123',
        vat: 'VAT123',
        orderCount: 10,
        // ... other fields
      };
      
      mockClient.query.mockResolvedValueOnce([mockDetail]);
      
      const result = await repository.getDetail('C001');
      
      expect(result).toEqual(mockDetail);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        { customerNumber: 'C001' }
      );
    });
    
    it('should return null when not found', async () => {
      mockClient.query.mockResolvedValueOnce([]); // Empty result
      
      const result = await repository.getDetail('NONEXISTENT');
      
      expect(result).toBeNull();
    });
  });
  
  describe('getOrders', () => {
    it('should return customer orders', async () => {
      const mockOrders = [
        {
          orderNumber: 'O001',
          customerOrderRef: 'REF001',
          orderDate: '2025-01-01',
          orderStatus: 'SHIPPED',
          itemCount: 5,
          orderTotal: 1000,
        },
      ];
      
      mockClient.query.mockResolvedValueOnce(mockOrders);
      
      const result = await repository.getOrders('C001', 0, 25);
      
      expect(result).toEqual(mockOrders);
      expect(result).toHaveLength(1);
    });
    
    it('should enforce max page size', async () => {
      mockClient.query.mockResolvedValueOnce([]);
      
      await repository.getOrders('C001', 0, 200); // Over limit
      
      const call = mockClient.query.mock.calls[0];
      expect(call[1].limit).toBe(100); // Clamped to MAX_PAGE_SIZE
    });
  });
});
```

**Run tests:**
```bash
npm test -- customerRepository.test.ts
```

**Acceptance criteria:**
- ✅ All repository methods work
- ✅ Pagination enforced
- ✅ Parameters passed correctly
- ✅ Returns typed results
- ✅ Null handling correct
- ✅ All tests pass
- ✅ 100% test coverage

**WAIT FOR APPROVAL before proceeding to Phase 3**

---

### Phase 3: Service and Controller Layers (2 hours)

#### Step 3.1: Create Service Layer

**File:** `api/src/features/customers/customerService.ts`

**Purpose:** Business logic, orchestration, composition.

**Why:** Separates business rules from data access. Testable. Composable.

```typescript
/**
 * Customer Service
 * 
 * PURPOSE: Business logic for customer operations
 * 
 * RESPONSIBILITIES:
 * - Business logic and rules
 * - Compose multiple repository calls
 * - Transform data for API consumers
 * - Apply default values and constraints
 * 
 * DOES NOT:
 * - Execute SQL (that's Repository)
 * - Handle HTTP (that's Controller)
 * - Directly manipulate database
 * 
 * WHY THIS LAYER:
 * - Business logic separate from data access
 * - Can compose multiple repositories
 * - Easy to test (mock repositories)
 * - Single place for business rules
 */

import { CustomerRepository } from './customerRepository';
import {
  CustomerSearchCriteria,
  CustomerListItem,
  CustomerDetail,
  CustomerOrder,
  PagedResult,
} from './customerTypes';
import { DatabaseConfig } from '../../infrastructure/db/config';

/**
 * Default page size
 * WHY: Business decision about UX
 * - 25 items is good balance for performance and usability
 * - Repository enforces max, service provides default
 */
const DEFAULT_PAGE_SIZE = DatabaseConfig.limits.defaultPageSize;

export class CustomerService {
  /**
   * Constructor
   * 
   * WHY dependency injection:
   * - Easy to test (inject mock repository)
   * - Could inject multiple repositories for cross-entity operations
   */
  constructor(private readonly repository: CustomerRepository) {}
  
  /**
   * Search customers with pagination
   * 
   * @param criteria - Search criteria (optional fields)
   * @returns Paginated customer list
   * 
   * BUSINESS LOGIC:
   * - Apply default page size if not specified
   * - Normalize offset (default to 0)
   * - Could add: access control, audit logging, etc.
   * 
   * WHY IN SERVICE:
   * - These defaults are business decisions
   * - Repository just executes queries
   * - Service decides what's "reasonable"
   */
  async searchCustomers(
    criteria: Partial<CustomerSearchCriteria>
  ): Promise<PagedResult<CustomerListItem>> {
    // Apply defaults
    // WHY: Better UX - client doesn't need to specify everything
    const searchCriteria: CustomerSearchCriteria = {
      name: criteria.name,
      customerNumber: criteria.customerNumber,
      phone: criteria.phone,
      offset: criteria.offset ?? 0,
      limit: criteria.limit ?? DEFAULT_PAGE_SIZE,
    };
    
    // Delegate to repository
    // WHY: Service doesn't know about SQL, just calls repository
    return this.repository.search(searchCriteria);
  }
  
  /**
   * Get customer detail
   * 
   * @param customerNumber - Customer identifier
   * @returns Customer detail or null
   * 
   * BUSINESS LOGIC:
   * - Currently just passes through to repository
   * - Could add: caching, access control, data transformation
   * 
   * WHY PASS-THROUGH:
   * - Simple cases don't need extra logic
   * - Layer exists for future business rules
   * - Keeps API consistent (always call service, not repository)
   */
  async getCustomerDetail(
    customerNumber: string
  ): Promise<CustomerDetail | null> {
    return this.repository.getDetail(customerNumber);
  }
  
  /**
   * Get customer orders with pagination
   * 
   * @param customerNumber - Customer identifier
   * @param page - Pagination parameters (optional)
   * @returns List of orders
   * 
   * BUSINESS LOGIC:
   * - Apply default pagination
   * - Could add: filtering, sorting, access control
   */
  async getCustomerOrders(
    customerNumber: string,
    page?: { offset?: number; limit?: number }
  ): Promise<CustomerOrder[]> {
    const offset = page?.offset ?? 0;
    const limit = page?.limit ?? DEFAULT_PAGE_SIZE;
    
    return this.repository.getOrders(customerNumber, offset, limit);
  }
  
  /**
   * Example: Composed operation
   * Get customer with recent orders in one call
   * 
   * WHY: Service can compose multiple repository calls
   * - Useful for complex use cases
   * - Reduces API round trips
   * - Business logic decides what "recent" means
   */
  async getCustomerWithRecentOrders(customerNumber: string) {
    // Get customer detail
    const customer = await this.repository.getDetail(customerNumber);
    
    if (!customer) {
      return null;
    }
    
    // Get recent orders (first 5)
    // WHY 5: Business decision (not too many, not too few)
    const recentOrders = await this.repository.getOrders(
      customerNumber,
      0,
      5
    );
    
    // Compose result
    return {
      ...customer,
      recentOrders,
    };
  }
}
```

**Test it:**

```typescript
// api/src/features/customers/__tests__/customerService.test.ts
import { CustomerService } from '../customerService';
import { CustomerRepository } from '../customerRepository';

describe('CustomerService', () => {
  let service: CustomerService;
  let mockRepository: jest.Mocked<CustomerRepository>;
  
  beforeEach(() => {
    mockRepository = {
      search: jest.fn(),
      getDetail: jest.fn(),
      getOrders: jest.fn(),
    } as any;
    
    service = new CustomerService(mockRepository);
  });
  
  describe('searchCustomers', () => {
    it('should apply default page size', async () => {
      mockRepository.search.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: { offset: 0, limit: 25 },
      });
      
      // Call without limit
      await service.searchCustomers({ name: 'Acme' });
      
      // Verify default was applied
      expect(mockRepository.search).toHaveBeenCalledWith({
        name: 'Acme',
        customerNumber: undefined,
        phone: undefined,
        offset: 0,
        limit: 25, // Default
      });
    });
    
    it('should apply default offset', async () => {
      mockRepository.search.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: { offset: 0, limit: 25 },
      });
      
      await service.searchCustomers({ name: 'Acme', limit: 10 });
      
      expect(mockRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 0 })
      );
    });
  });
  
  describe('getCustomerWithRecentOrders', () => {
    it('should compose customer and orders', async () => {
      const mockCustomer = {
        customerNumber: 'C001',
        customerName: 'Acme Corp',
        orderCount: 100,
      } as any;
      
      const mockOrders = [
        { orderNumber: 'O001' },
        { orderNumber: 'O002' },
      ] as any;
      
      mockRepository.getDetail.mockResolvedValueOnce(mockCustomer);
      mockRepository.getOrders.mockResolvedValueOnce(mockOrders);
      
      const result = await service.getCustomerWithRecentOrders('C001');
      
      expect(result).toEqual({
        ...mockCustomer,
        recentOrders: mockOrders,
      });
      
      // Verify repository calls
      expect(mockRepository.getDetail).toHaveBeenCalledWith('C001');
      expect(mockRepository.getOrders).toHaveBeenCalledWith('C001', 0, 5);
    });
    
    it('should return null if customer not found', async () => {
      mockRepository.getDetail.mockResolvedValueOnce(null);
      
      const result = await service.getCustomerWithRecentOrders('NONEXISTENT');
      
      expect(result).toBeNull();
      // Orders should not be fetched
      expect(mockRepository.getOrders).not.toHaveBeenCalled();
    });
  });
});
```

**Acceptance criteria:**
- ✅ Service applies business logic
- ✅ Defaults work correctly
- ✅ Composition works
- ✅ All tests pass

**Continue to Step 3.2 (same approval cycle)**

---

## 4. Testing Strategy

### 4.1. Test Levels

**Unit Tests (60% of tests)**
- Test individual functions in isolation
- Mock all dependencies
- Fast (< 1ms per test)
- Run on every save

**Integration Tests (30% of tests)**
- Test multiple layers together
- Use test database or fixtures
- Medium speed (< 100ms per test)
- Run before commit

**E2E Tests (10% of tests)**
- Test full HTTP request → database → response
- Use real database
- Slow (< 1s per test)
- Run before deploy

### 4.2. What To Test

**Infrastructure (loadQuery):**
- ✅ Loads SQL file
- ✅ Replaces schema placeholders
- ✅ Caches results
- ✅ Throws error for missing files
- ✅ Validates all placeholders replaced

**Query Registry:**
- ✅ All queries load
- ✅ Schemas substituted correctly
- ✅ No SQL syntax errors

**Repository:**
- ✅ Calls SQL client correctly
- ✅ Passes parameters correctly
- ✅ Returns typed results
- ✅ Enforces pagination limits
- ✅ Handles null results

**Service:**
- ✅ Applies business logic
- ✅ Composes repositories
- ✅ Applies defaults

**Controller:**
- ✅ Validates input
- ✅ Calls service
- ✅ Formats response
- ✅ Handles errors

---

## 5. Deployment Guide

### 5.1. Build Process

```json
// package.json
{
  "scripts": {
    "build": "npm run build:ts && npm run copy:sql",
    "build:ts": "tsc",
    "copy:sql": "copyfiles -u 1 'src/**/*.sql' dist/",
    "test": "jest",
    "start": "node dist/server.js"
  },
  "devDependencies": {
    "copyfiles": "^2.4.1"
  }
}
```

### 5.2. Environment Variables

```bash
# .env.production
DB_SCHEMA_PRIMARY=PRIMARY_SCHEMA
DB_SCHEMA_SECONDARY=SECONDARY_SCHEMA
DB_SERVER=your-azure-server.database.windows.net
DB_NAME=YourDatabase
NODE_ENV=production
```

### 5.3. Azure Web App Deployment

```bash
# Build locally
npm run build

# Deploy contains:
dist/
  features/
    customers/
      queries/
        *.sql          # SQL files
      *.js            # Compiled TS
  infrastructure/
    db/
      loadQuery.js    # Compiled query loader
      config.js       # Config

# Azure runs:
node dist/server.js
```

### 5.4. Startup Flow

```
1. Azure starts app
2. Node.js loads dist/server.js
3. Server imports features/customers/customerRepository
4. Repository imports features/customers/customerQueries
5. customerQueries runs: loadQuery() for each query
6. loadQuery() reads .sql files, substitutes schemas, caches
7. App ready to serve requests
8. All requests use cached queries (no file I/O)
```

---

## 6. Why Decisions Were Made

### Why Runtime (Not Build-Time)?

**DBA workflow is critical.** DBAs need to optimize queries and deploy fixes without developer involvement. Runtime loading allows this. Build-time would require TS rebuild for every SQL change.

### Why 40-Line Utility (Not Complex Class)?

**Simplicity.** The task is simple: read file, replace string, cache. No need for classes, interfaces, dependency injection. Simple function does the job.

### Why Cache Forever (Not TTL)?

**Queries never change at runtime.** Once loaded, they're valid until app restarts. No need for invalidation logic.

### Why Two Schemas from Day 1?

**Real requirement.** Better to build for the actual use case than retrofit later. The utility handles this naturally.

### Why Repository Pattern?

**Separation of concerns.** Data access should be separate from business logic. Easy to test. Easy to swap implementations.

### Why SQL Files (Not Inline)?

**Proper separation.** SQL deserves proper tooling, DBA workflow, and separation from TypeScript.

### Why Pagination Everywhere?

**Large dataset.** Must never allow fetching all data. Enforce at repository level (closest to data source).

### Why Detailed Comments?

**Team onboarding.** Code must be self-explanatory for new team members. Comments explain WHY, not just WHAT.

---

## Appendix A: Complete File Checklist

**Infrastructure (3 files):**
- [ ] `infrastructure/db/config.ts` - Database configuration
- [ ] `infrastructure/db/loadQuery.ts` - Query loader utility
- [ ] `infrastructure/db/__tests__/loadQuery.test.ts` - Tests

**Customer Feature (12 files):**
- [ ] `features/customers/queries/count.sql` - Count query
- [ ] `features/customers/queries/list.sql` - List query
- [ ] `features/customers/queries/detail.sql` - Detail query (2 schemas)
- [ ] `features/customers/queries/orders-list.sql` - Orders drill-down
- [ ] `features/customers/customerQueries.ts` - Query registry
- [ ] `features/customers/customerTypes.ts` - TypeScript types
- [ ] `features/customers/customerRepository.ts` - Data access
- [ ] `features/customers/customerService.ts` - Business logic
- [ ] `features/customers/customerController.ts` - HTTP handlers
- [ ] `features/customers/__tests__/customerQueries.test.ts`
- [ ] `features/customers/__tests__/customerRepository.test.ts`
- [ ] `features/customers/__tests__/customerService.test.ts`

**Total: 15 files for complete working feature**

---

## Appendix B: Success Metrics

**Technical:**
- ✅ Query load time < 100ms total at startup
- ✅ Zero file I/O during requests
- ✅ All queries < 3 seconds
- ✅ Test coverage > 80%

**Developer Experience:**
- ✅ Time to add new query < 15 minutes
- ✅ Time to modify query < 5 minutes
- ✅ DBA can optimize without dev help

**Quality:**
- ✅ Zero SQL injection vulnerabilities
- ✅ All pagination enforced
- ✅ All types correct
- ✅ All tests passing

---

**END OF IMPLEMENTATION GUIDE**

**Status:** Ready for Phase 1 Implementation  
**Next Action:** Begin Step 1.1 (Database Configuration)  
**Approval Required:** After each phase before proceeding


