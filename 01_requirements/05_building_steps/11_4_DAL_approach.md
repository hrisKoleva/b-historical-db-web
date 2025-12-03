# Data Access Layer - Production-Ready Approach

**Date:** December 3, 2025  
**Status:** PRODUCTION READY  
**Related Documents:**
- 11_3_DAL_decision.md (Full implementation guide)
- 11_3_1_DAL_decision_critique.md (Expert review)
- 11_1_security_concerns.md (Security validation)

---

## Executive Summary

**APPROACH:** Runtime SQL file loading with multi-schema support, cached at startup.

**Architecture:** Simple utility function + SQL files + typed repositories + optional count mode.

**Key Benefits:**
- ✅ Simple and maintainable
- ✅ Flexible (2+ schemas supported from day 1)
- ✅ Fast (cached at startup, zero runtime overhead)
- ✅ DBA-friendly (real .sql files)
- ✅ Production-tested pattern
- ✅ Fully testable
- ✅ Performance optimizations built-in

**Refinements from Expert Review:**
- Optional COUNT queries for performance
- Query timing and monitoring
- Improved logging and observability
- Lazy config validation
- Production-grade error handling

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Infrastructure](#2-core-infrastructure)
3. [Feature Implementation Pattern](#3-feature-implementation-pattern)
4. [Testing Strategy](#4-testing-strategy)
5. [Observability & Monitoring](#5-observability--monitoring)
6. [Deployment](#6-deployment)
7. [Performance Optimization](#7-performance-optimization)

---

## 1. Architecture Overview

### 1.1. Visual Overview

```
┌─────────────────────────────────────────────────────────┐
│  React Frontend                                         │
│  - Calls REST API                                       │
│  - Knows: pagination, filters, drill-down levels       │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTP
┌─────────────────────────────────────────────────────────┐
│  Express API                                            │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Controllers → Services → Repositories             │ │
│  │ (HTTP + Error  (Business)  (Data Access)          │ │
│  │  Masking)                                         │ │
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
│  │ loadQuery() utility                              │  │
│  │ - Reads .sql files once at startup               │  │
│  │ - Substitutes {{SCHEMA_*}} → actual names        │  │
│  │ - Caches in memory forever                       │  │
│  │ - Validates placeholders                         │  │
│  └──────────────────────────────────────────────────┘  │
│                     ↓                                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │ SqlClient (Connection Pool) + Query Timer        │  │
│  │ - ONE pool per process (not per request)         │  │
│  │ - Azure AD auth                                  │  │
│  │ - Parameterized queries                          │  │
│  │ - Slow query logging (>5s, >10s)                │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Azure SQL Database                                     │
│  - M3FDBPRD (Primary schema) - Historical data         │
│  - M3FDBADD (Secondary schema) - Additional data       │
│  - Read-only access (db_datareader role)               │
└─────────────────────────────────────────────────────────┘
```

### 1.2. Directory Structure

```
api/
  src/
    infrastructure/
      db/
        config.ts              # Database configuration (lazy validation)
        loadQuery.ts           # Query loader utility
        sqlClient.ts           # Connection pool + query timing
        logger.ts              # Structured logging
        __tests__/
          loadQuery.test.ts
    
    features/
      customers/
        queries/               # SQL files folder
          list.sql
          count.sql            # Optional (can skip for performance)
          detail.sql
          orders-list.sql
        customerQueries.ts     # Query registry
        customerTypes.ts       # TypeScript types
        customerRepository.ts  # Data access
        customerService.ts     # Business logic
        customerController.ts  # HTTP handlers + error masking
        __tests__/
          customerRepository.test.ts
          customerService.test.ts
```

---

## 2. Core Infrastructure

### 2.1. Database Configuration (Lazy Validation)

**File:** `api/src/infrastructure/db/config.ts`

**WHY Changes:**
- Validation moved to explicit `initDatabaseConfig()` instead of import-time
- Allows unit tests and type imports without DB connection
- More control over when validation happens

```typescript
/**
 * Database Configuration
 * 
 * WHY: Centralized database configuration with lazy validation
 * - All schemas defined in one place
 * - Easy to change per environment (dev/test/prod)
 * - Validation happens at app startup, not import time
 */

export const DatabaseConfig = {
  schemas: {
    primary: process.env.DB_SCHEMA_PRIMARY || 'M3FDBPRD',
    secondary: process.env.DB_SCHEMA_SECONDARY || 'M3FDBADD',
  },
  
  connection: {
    server: process.env.DB_SERVER || '',
    database: process.env.DB_NAME || '',
  },
  
  limits: {
    maxPageSize: 100,
    defaultPageSize: 25,
    queryTimeout: 30000,        // 30 seconds max
    slowQueryThreshold1: 5000,  // Warn at 5s
    slowQueryThreshold2: 10000, // Alert at 10s
  },
} as const;

/**
 * Initialize and validate database configuration
 * 
 * WHY: Explicit validation instead of import-time
 * - Call this at app startup
 * - Doesn't break unit tests that just need types
 * - Clear fail-fast behavior when actually needed
 */
export function initDatabaseConfig(): void {
  if (!DatabaseConfig.connection.server || !DatabaseConfig.connection.database) {
    throw new Error(
      'Database configuration missing. Required: DB_SERVER, DB_NAME'
    );
  }
  
  console.log('[DB Config] Initialized:', {
    server: DatabaseConfig.connection.server,
    database: DatabaseConfig.connection.database,
    primarySchema: DatabaseConfig.schemas.primary,
    secondarySchema: DatabaseConfig.schemas.secondary,
  });
}
```

---

### 2.2. Query Loader (Production Logging)

**File:** `api/src/infrastructure/db/loadQuery.ts`

**WHY Changes:**
- Debug-only logging in production (not spam)
- Better test fixture paths
- Explicit cache stats for monitoring

```typescript
/**
 * Query Loader Utility
 * 
 * PURPOSE: Load SQL query files with schema substitution
 * 
 * WHY THIS EXISTS:
 * - Keeps SQL in .sql files (DBA-friendly, tooling works)
 * - Supports multiple schemas
 * - Caches loaded queries (zero runtime overhead)
 * - Validates all placeholders are replaced (fail fast)
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const queryCache = new Map<string, string>();

/**
 * Load a SQL query file with schema substitution
 * 
 * @param relativePath - Path from src/ directory to .sql file
 * @param schemas - Schema name(s) to substitute
 * @returns SQL query string with schemas substituted
 * @throws Error if file not found or placeholders not replaced
 */
export function loadQuery(
  relativePath: string,
  schemas: Record<string, string>
): string {
  const cacheKey = `${relativePath}:${JSON.stringify(schemas)}`;
  
  if (queryCache.has(cacheKey)) {
    return queryCache.get(cacheKey)!;
  }
  
  try {
    const absolutePath = join(__dirname, '../..', relativePath);
    let sql = readFileSync(absolutePath, 'utf-8');
    
    // Replace each schema placeholder
    for (const [placeholder, schemaName] of Object.entries(schemas)) {
      const pattern = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
      sql = sql.replace(pattern, schemaName);
    }
    
    // Validate: ensure ALL placeholders were replaced
    if (sql.match(/\{\{[A-Z_]+\}\}/)) {
      const unreplaced = sql.match(/\{\{([A-Z_]+)\}\}/);
      throw new Error(
        `Unreplaced placeholder {{${unreplaced?.[1]}}} in ${relativePath}.\n` +
        `Available schemas: ${Object.keys(schemas).join(', ')}\n` +
        `Tip: Check your SQL file has correct placeholder names.`
      );
    }
    
    queryCache.set(cacheKey, sql);
    
    // Log only in development
    // WHY: Prevents log spam in production with many queries
    if (process.env.NODE_ENV === 'development') {
      console.log(`[QueryLoader] Loaded: ${relativePath}`);
    }
    
  } catch (error) {
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
 */
export function clearQueryCache(): void {
  queryCache.clear();
}

/**
 * Get cache statistics (for health checks)
 * 
 * WHY: Verify all queries loaded at startup
 * Expose as /health/queries endpoint
 */
export function getQueryCacheStats() {
  return {
    size: queryCache.size,
    queries: Array.from(queryCache.keys()),
  };
}
```

---

### 2.3. SQL Client with Query Timing

**File:** `api/src/infrastructure/db/sqlClient.ts`

**WHY Changes:**
- Query timing wrapper added
- Slow query logging at 5s and 10s thresholds
- ONE pool per process emphasized
- Correlation ID support

```typescript
/**
 * SQL Client with Query Timing
 * 
 * WHY: Wrap database calls with timing and logging
 * - Track slow queries (>5s, >10s)
 * - Log for cost optimization
 * - ONE pool per process (critical for performance)
 */

import sql from 'mssql';
import { DatabaseConfig } from './config';

/**
 * SQL Client
 * 
 * CRITICAL: Create ONE instance per process
 * DO NOT instantiate per request - kills performance and cost
 */
export class SqlClient {
  private pool: sql.ConnectionPool | null = null;
  
  /**
   * Initialize connection pool
   * 
   * WHY: ONE pool per process, reused for all requests
   * - Configured for Azure SQL tier
   * - Connection timeout and pool size tuned
   */
  async connect(): Promise<void> {
    if (this.pool) {
      return; // Already connected
    }
    
    const config: sql.config = {
      server: DatabaseConfig.connection.server,
      database: DatabaseConfig.connection.database,
      authentication: {
        type: 'azure-active-directory-default',
      },
      options: {
        encrypt: true,
        trustServerCertificate: false,
        requestTimeout: DatabaseConfig.limits.queryTimeout,
      },
      pool: {
        max: 10,  // Tune based on Azure SQL tier
        min: 2,
        idleTimeoutMillis: 30000,
      },
    };
    
    this.pool = await sql.connect(config);
    console.log('[SqlClient] Connected to database');
  }
  
  /**
   * Execute query with timing
   * 
   * WHY: Timing wrapper catches slow queries
   * - Log warnings at 5s
   * - Log alerts at 10s
   * - Track for cost optimization
   * 
   * @param queryString - SQL query (from loadQuery)
   * @param params - Query parameters
   * @param correlationId - Optional correlation ID for tracing
   */
  async query<T>(
    queryString: string,
    params: Record<string, any> = {},
    correlationId?: string
  ): Promise<T[]> {
    if (!this.pool) {
      throw new Error('SqlClient not connected. Call connect() first.');
    }
    
    const startTime = Date.now();
    
    try {
      const request = this.pool.request();
      
      // Add parameters
      for (const [key, value] of Object.entries(params)) {
        request.input(key, value);
      }
      
      // Execute query
      const result = await request.query(queryString);
      
      // Calculate duration
      const duration = Date.now() - startTime;
      
      // Log slow queries
      if (duration > DatabaseConfig.limits.slowQueryThreshold2) {
        // ALERT: Very slow (>10s)
        console.error('[SqlClient] SLOW QUERY ALERT', {
          duration,
          correlationId,
          queryStart: queryString.substring(0, 100),
          rowCount: result.recordset.length,
        });
      } else if (duration > DatabaseConfig.limits.slowQueryThreshold1) {
        // WARN: Slow (>5s)
        console.warn('[SqlClient] Slow query detected', {
          duration,
          correlationId,
          queryStart: queryString.substring(0, 100),
          rowCount: result.recordset.length,
        });
      }
      
      // Log all queries in development
      if (process.env.NODE_ENV === 'development') {
        console.log('[SqlClient] Query executed', {
          duration,
          rowCount: result.recordset.length,
        });
      }
      
      return result.recordset as T[];
      
    } catch (error) {
      // Log error with context
      console.error('[SqlClient] Query failed', {
        error: error instanceof Error ? error.message : error,
        correlationId,
        queryStart: queryString.substring(0, 100),
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }
  
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      console.log('[SqlClient] Disconnected');
    }
  }
}

// Export single instance
// WHY: ONE pool per process (not per request)
export const sqlClient = new SqlClient();
```

---

## 3. Feature Implementation Pattern

### 3.1. Repository with Optional Count

**File:** `api/src/features/customers/customerRepository.ts`

**WHY Changes:**
- `includeTotal` parameter for optional counting
- Useful for "filter-as-you-type" where total isn't needed
- Reduces DB load for heavy queries

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
  CustomerDetail,
  CustomerOrder,
  PagedResult,
} from './customerTypes';

const MAX_PAGE_SIZE = DatabaseConfig.limits.maxPageSize;

export class CustomerRepository {
  constructor(private readonly client: SqlClient) {}
  
  /**
   * Search customers with optional count
   * 
   * @param criteria - Search filters and pagination
   * @param options - Search options
   * @param options.includeTotal - Whether to execute COUNT query (default: true)
   *        Set to false for "filter-as-you-type" or when total isn't needed
   * @param options.correlationId - Optional correlation ID for logging
   * 
   * WHY includeTotal:
   * - Initial load or pagination UI: includeTotal=true (get total)
   * - Live filtering or background fetches: includeTotal=false (skip count)
   * - Performance optimization for expensive filters
   */
  async search(
    criteria: CustomerSearchCriteria,
    options: { includeTotal?: boolean; correlationId?: string } = {}
  ): Promise<PagedResult<CustomerListItem>> {
    const { includeTotal = true, correlationId } = options;
    
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
      const [countRow] = await this.client.query<{ total: number }>(
        CustomerQueries.COUNT,
        params,
        correlationId
      );
      total = countRow?.total ?? 0;
    }
    
    // Execute data query
    const items = await this.client.query<CustomerListItem>(
      CustomerQueries.LIST,
      params,
      correlationId
    );
    
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
   * Get customer detail
   * 
   * WHY TWO SCHEMAS:
   * - Query joins primary + secondary schemas
   * - Gets all data in one trip to database
   */
  async getDetail(
    customerNumber: string,
    correlationId?: string
  ): Promise<CustomerDetail | null> {
    const [detail] = await this.client.query<CustomerDetail>(
      CustomerQueries.DETAIL,
      { customerNumber },
      correlationId
    );
    
    return detail ?? null;
  }
  
  /**
   * Get customer orders (drill-down)
   * 
   * WHY NO TOTAL:
   * - Often not needed for drill-downs
   * - Add separate orders-count.sql if UI needs it
   */
  async getOrders(
    customerNumber: string,
    offset: number,
    limit: number,
    correlationId?: string
  ): Promise<CustomerOrder[]> {
    const safeLimit = Math.min(limit, MAX_PAGE_SIZE);
    
    return this.client.query<CustomerOrder>(
      CustomerQueries.ORDERS,
      {
        customerNumber,
        offset,
        limit: safeLimit,
      },
      correlationId
    );
  }
}
```

---

### 3.2. Service Layer

**File:** `api/src/features/customers/customerService.ts`

**WHY:** Business logic and repository composition

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
  CustomerDetail,
  CustomerOrder,
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
   */
  async searchCustomers(
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
  
  async getCustomerDetail(
    customerNumber: string,
    correlationId?: string
  ): Promise<CustomerDetail | null> {
    return this.repository.getDetail(customerNumber, correlationId);
  }
  
  async getCustomerOrders(
    customerNumber: string,
    page?: { offset?: number; limit?: number },
    correlationId?: string
  ): Promise<CustomerOrder[]> {
    const offset = page?.offset ?? 0;
    const limit = page?.limit ?? DEFAULT_PAGE_SIZE;
    
    return this.repository.getOrders(
      customerNumber,
      offset,
      limit,
      correlationId
    );
  }
  
  /**
   * Composed operation: Get customer with recent orders
   * 
   * WHY: Reduces API round trips for initial render
   */
  async getCustomerWithRecentOrders(
    customerNumber: string,
    correlationId?: string
  ) {
    const customer = await this.repository.getDetail(
      customerNumber,
      correlationId
    );
    
    if (!customer) {
      return null;
    }
    
    const recentOrders = await this.repository.getOrders(
      customerNumber,
      0,
      5,
      correlationId
    );
    
    return {
      ...customer,
      recentOrders,
    };
  }
}
```

---

### 3.3. Controller with Error Masking

**File:** `api/src/features/customers/customerController.ts`

**WHY Changes:**
- Error masking for security (don't leak SQL errors)
- Correlation ID generation
- Structured error responses

```typescript
/**
 * Customer Controller
 * 
 * PURPOSE: HTTP handlers with error masking
 * 
 * WHY ERROR MASKING:
 * - Never expose SQL errors to clients
 * - Log technical details with correlation ID
 * - Return generic error messages to users
 */

import { Request, Response, NextFunction } from 'express';
import { CustomerService } from './customerService';
import { v4 as uuidv4 } from 'uuid';

export class CustomerController {
  constructor(private readonly service: CustomerService) {}
  
  /**
   * Search customers
   * GET /api/customers?name=Acme&limit=25&offset=0&mode=noTotal
   */
  async search(req: Request, res: Response, next: NextFunction) {
    const correlationId = uuidv4();
    
    try {
      const { name, customerNumber, phone, limit, offset, mode } = req.query;
      
      const result = await this.service.searchCustomers(
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
      
      res.json(result);
      
    } catch (error) {
      // Log technical error with correlation ID
      console.error('[CustomerController] Search failed', {
        error: error instanceof Error ? error.message : error,
        correlationId,
        query: req.query,
      });
      
      // Return generic error to client
      // WHY: Don't leak SQL error messages or schema info
      res.status(500).json({
        error: 'Unable to search customers',
        message: 'An error occurred while processing your request',
        correlationId, // Client can report this for support
      });
    }
  }
  
  /**
   * Get customer detail
   * GET /api/customers/:id
   */
  async getDetail(req: Request, res: Response, next: NextFunction) {
    const correlationId = uuidv4();
    
    try {
      const { id } = req.params;
      
      const customer = await this.service.getCustomerDetail(id, correlationId);
      
      if (!customer) {
        return res.status(404).json({
          error: 'Customer not found',
          message: `No customer found with ID: ${id}`,
        });
      }
      
      res.json(customer);
      
    } catch (error) {
      console.error('[CustomerController] Get detail failed', {
        error: error instanceof Error ? error.message : error,
        correlationId,
        customerId: req.params.id,
      });
      
      res.status(500).json({
        error: 'Unable to retrieve customer details',
        message: 'An error occurred while processing your request',
        correlationId,
      });
    }
  }
  
  /**
   * Get customer orders
   * GET /api/customers/:id/orders?limit=25&offset=0
   */
  async getOrders(req: Request, res: Response, next: NextFunction) {
    const correlationId = uuidv4();
    
    try {
      const { id } = req.params;
      const { limit, offset } = req.query;
      
      const orders = await this.service.getCustomerOrders(
        id,
        {
          limit: limit ? parseInt(limit as string) : undefined,
          offset: offset ? parseInt(offset as string) : undefined,
        },
        correlationId
      );
      
      res.json({ items: orders });
      
    } catch (error) {
      console.error('[CustomerController] Get orders failed', {
        error: error instanceof Error ? error.message : error,
        correlationId,
        customerId: req.params.id,
      });
      
      res.status(500).json({
        error: 'Unable to retrieve customer orders',
        message: 'An error occurred while processing your request',
        correlationId,
      });
    }
  }
}
```

---

## 4. Testing Strategy

### 4.1. Test Levels

**Unit Tests (60%):**
- Individual functions in isolation
- Mock all dependencies
- Fast (< 1ms)
- Run on every save

**Integration Tests (30%):**
- Multiple layers together
- Test database or fixtures in `src/test-resources/`
- Medium speed (< 100ms)
- Run before commit

**E2E Tests (10%):**
- Full HTTP → database → response
- Real database
- Slow (< 1s)
- Run before deploy

### 4.2. Test Fixture Organization

**WHY Change:** Better test fixture paths

```
api/
  src/
    test-resources/
      queries/
        test-simple.sql
        test-multi-schema.sql
      fixtures/
        customer-data.json
```

---

## 5. Observability & Monitoring

### 5.1. Health Check Endpoint

**File:** `api/src/infrastructure/health.ts`

**WHY:** Expose query cache stats and DB connection status

```typescript
/**
 * Health Check Endpoints
 * 
 * WHY: Monitor that all queries loaded and DB is healthy
 */

import { Router } from 'express';
import { getQueryCacheStats } from './db/loadQuery';
import { sqlClient } from './db/sqlClient';

const router = Router();

/**
 * GET /health
 * Basic health check
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/queries
 * Query cache statistics
 * 
 * WHY: Verify all queries loaded at startup
 */
router.get('/health/queries', (req, res) => {
  const stats = getQueryCacheStats();
  
  res.json({
    status: 'healthy',
    queryCacheSize: stats.size,
    queries: stats.queries,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/db
 * Database connection check
 * 
 * WHY: Verify DB connection is alive
 */
router.get('/health/db', async (req, res) => {
  try {
    await sqlClient.query('SELECT 1 AS test');
    
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
```

---

### 5.2. Slow Query Monitoring

**Already built into SqlClient:**
- Logs warnings at 5s
- Logs alerts at 10s
- Includes correlation ID
- Track in Application Insights

**Action items:**
- Set up alerts for queries >10s
- Review slow queries weekly
- Add indexes as needed
- Keep execution plans documented

---

## 6. Deployment

### 6.1. App Startup Sequence

**File:** `api/src/server.ts`

**WHY:** Explicit initialization order

```typescript
/**
 * App Startup
 * 
 * WHY: Clear initialization order
 * 1. Validate config
 * 2. Connect to DB
 * 3. Import features (loads queries)
 * 4. Start server
 */

import { initDatabaseConfig } from './infrastructure/db/config';
import { sqlClient } from './infrastructure/db/sqlClient';
import healthRouter from './infrastructure/health';
import express from 'express';

async function startServer() {
  const app = express();
  
  // 1. Validate configuration
  console.log('[Startup] Validating configuration...');
  initDatabaseConfig();
  
  // 2. Connect to database
  console.log('[Startup] Connecting to database...');
  await sqlClient.connect();
  
  // 3. Register routes (this loads queries)
  console.log('[Startup] Loading queries and routes...');
  app.use('/api/health', healthRouter);
  // ... register other routes
  
  // 4. Start server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[Startup] Server listening on port ${PORT}`);
    console.log(`[Startup] Health check: http://localhost:${PORT}/api/health/queries`);
  });
}

// Error handling
startServer().catch((error) => {
  console.error('[Startup] Failed to start server:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Shutdown] SIGTERM received, closing connections...');
  await sqlClient.close();
  process.exit(0);
});
```

---

### 6.2. Build Process

**File:** `package.json`

```json
{
  "scripts": {
    "build": "npm run build:ts && npm run copy:sql",
    "build:ts": "tsc",
    "copy:sql": "copyfiles -u 1 'src/**/*.sql' dist/",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "start": "node dist/server.js",
    "dev": "ts-node-dev src/server.ts"
  },
  "devDependencies": {
    "copyfiles": "^2.4.1",
    "ts-node-dev": "^2.0.0"
  }
}
```

---

## 7. Performance Optimization

### 7.1. Query Optimization Checklist

For every new query, enforce this discipline:

1. **Test in Azure Data Studio:**
   - Run with representative data
   - Check execution plan
   - Verify index usage
   - Check row estimates vs actual rows
   - Measure logical reads

2. **Performance Expectations:**
   - Simple lookups (PK): < 100ms
   - List queries: < 1s
   - Complex aggregations: < 3s
   - Anything >5s: WARN log
   - Anything >10s: ALERT log

3. **Required Indexes:**
   - Document in SQL file header
   - Verify they exist
   - Track missing indexes

4. **Avoid Table Scans:**
   - 600k–15M rows per table
   - Table scans = cost and performance issues
   - All filters must use indexes

---

### 7.2. Cost Optimization

**Azure SQL Cost Levers:**

1. **Query Efficiency:**
   - Well-indexed queries
   - Pagination enforced
   - Optional COUNT for heavy filters

2. **Connection Pool:**
   - ONE pool per process ✅
   - Reused across requests ✅
   - Tuned for Azure tier ✅

3. **API Patterns:**
   - Avoid N+1 queries (use service composition)
   - Don't chain sequential heavy queries
   - Pre-fetch patterns (getCustomerWithRecentOrders)

4. **Monitoring:**
   - Track slow queries (>5s, >10s)
   - Review weekly
   - Optimize high-frequency queries first

---

## 8. Summary: What We Built

### Architecture
- ✅ Runtime SQL loading (DBA-friendly)
- ✅ Multi-schema support from day 1
- ✅ Startup caching (zero runtime overhead)
- ✅ Per-feature organization (scales to 10+ features)

### Performance
- ✅ Optional COUNT queries (mode: "noTotal")
- ✅ Query timing with 5s/10s thresholds
- ✅ ONE connection pool per process
- ✅ Pagination enforced everywhere

### Observability
- ✅ Correlation IDs for tracing
- ✅ Slow query logging
- ✅ Health check endpoints
- ✅ Query cache statistics

### Production-Ready
- ✅ Error masking (no SQL leaks)
- ✅ Lazy config validation (test-friendly)
- ✅ Graceful shutdown
- ✅ Development vs production logging

### Quality
- ✅ Fully testable (mocks at each layer)
- ✅ Type-safe (TypeScript throughout)
- ✅ Documented ("why" not just "what")
- ✅ Simple (no over-engineering)

---

## Next Steps

1. **Implement Phase 1** (Core Infrastructure):
   - [ ] `config.ts` with lazy validation
   - [ ] `loadQuery.ts` with debug logging
   - [ ] `sqlClient.ts` with query timing
   - [ ] Health check endpoints
   - [ ] Tests for all of the above

2. **Implement Phase 2** (First Feature):
   - [ ] Customer SQL files
   - [ ] Customer query registry
   - [ ] Customer types
   - [ ] Customer repository (with includeTotal)
   - [ ] Customer service
   - [ ] Customer controller (with error masking)
   - [ ] Tests for all of the above

3. **Test & Validate:**
   - [ ] All queries tested in Azure Data Studio
   - [ ] Execution plans reviewed
   - [ ] Unit tests pass
   - [ ] Integration tests pass
   - [ ] Health checks work

4. **Deploy & Monitor:**
   - [ ] Deploy to Azure Web App
   - [ ] Verify health checks
   - [ ] Monitor slow queries
   - [ ] Set up alerts (>10s queries)

---

**END OF PRODUCTION-READY APPROACH**

**Status:** Ready for Implementation  
**Confidence:** High (expert-reviewed, production-tested pattern)  
**Estimated Time:** 8-10 hours for complete first feature


