# Metadata-Driven Search Module – Implementation Plan

## Goal
Extend the current customer-only search into a reusable module that serves any business scope (Customers, Suppliers, Orders, Products, etc.) by assembling SQL queries from declarative metadata instead of hand-written repositories.

## Assumptions
- Azure SQL remains the primary datastore.
- Existing infrastructure adapters (`SqlClient`, `DatabaseProvider`) stay unchanged.
- New scopes will follow the same paging + sorting semantics already exposed to the frontend.

## Phase 1 – Discovery & Metadata Design
1. **Inventory scopes & filters**
   - Gather final list of MVP scopes and roadmap additions.
   - For each scope, document required fields, joins, default sorts, and filter operators.
   - Output: `metadata/scopes/<scope>.yml` drafts or equivalent tracking sheet.

2. **Define metadata schema**
   - Model entities: `ScopeDefinition`, `FieldDefinition`, `FilterDefinition`, `JoinDefinition`, `AggregateDefinition`.
   - Capture validation rules (e.g., `operator: 'contains'` implies text field).
   - Output: `metadata/metadata.schema.json` (JSON Schema) + TypeScript interfaces.

3. **Decide storage & tooling**
   - Choose file format (JSON/YAML) and location under `api/src/metadata`.
   - Add ESLint/TSC/CI guard to load and validate metadata during builds (`npm run lint:metadata`).

## Phase 2 – Core Library
4. **Create metadata loader**
   - Implement `ScopeRegistry` that loads all scope files, validates against the schema, and exposes read-only access.
   - Support hot-reload in dev by clearing require cache or using `fs/promises`.
   - Unit tests: invalid metadata rejection, duplicate scope detection.

5. **Shared filter grammar**
   - Establish API payload contract: `POST /api/search` body `{ scope, filters, sort, pagination }`.
   - Implement parsing/validation module (`parseSearchRequest`) to transform raw payload into typed filter objects.
   - Tests: invalid operator, unknown field, pagination clamping.

6. **Query builder abstraction**
   - Build `QueryPlanBuilder` responsible for:
     - Selecting base table/view and columns.
     - Applying joins defined in metadata.
     - Translating filters/operators to SQL predicates with parameter binding.
     - Applying sorting and pagination.
   - Consider using Knex or maintain custom builder; encapsulate SQL string generation in one place.
   - Tests: generate SQL snapshots per operator; ensure parameters align with predicates.

7. **Aggregation support**
   - Extend builder to produce count queries from metadata (`countStrategy`).
   - Optionally support custom SQL snippets (e.g., materialised view references) gated by metadata flags.

## Phase 3 – Service & Repository Refactor
8. **Generic search repository**
   - Introduce `MetadataSearchRepository` with API:
     ```ts
     search(scopeId: string, request: SearchRequest): Promise<SearchResult>;
     ```
   - Internally orchestrates registry lookup + query builder + `SqlClient`.
   - Handles recent-orders JSON expansion via metadata-driven projections (e.g., `field.transformer` callback).
   - Tests: mock `SqlClient` to ensure correct SQL statements and parameter maps.

9. **Search service**
   - Replace `CustomerService` with `SearchService` that:
     - Validates scope existence.
     - Delegates to repository.
     - Shapes response envelope `{ data, pagination }`.
     - Applies cross-cutting filters (tenant, security) before query execution.
   - Provide thin adapters for backward compatibility (`CustomersService` wraps `SearchService` with `scopeId='customers'`).

10. **Express router**
    - Introduce `createSearchRouter` with endpoints:
      - `GET /api/search/:scopeId` (query-string filters) for gradual migration.
      - `POST /api/search` (JSON payload) as canonical entry point.
    - Update existing `customers` route to reuse the new service but keep URL stable for the current frontend.
    - Tests: end-to-end supertest verifying metadata-driven routes respond correctly.

## Phase 4 – Frontend Integration
11. **Expose scope metadata to the client**
    - Add `GET /api/search/config` endpoint that serialises scope definitions (labels, filters, columns, defaults).
    - Include cache headers and optional ETaging to minimise payload reloads.
    - Verify the payload matches a TypeScript contract consumable by the web app.

12. **Metadata-aware hooks**
    - Implement `useScopeConfig()` hook to fetch and memoise the config; provide loading/error states.
    - Create `useScopeSearch(scopeId, initialFilters)` that handles query assembly, fetch, pagination, and error messaging using scope metadata.
    - Ensure hooks accept overrides for `ScopeLabel` so the UI strings (error, empty state) adapt per scope.

13. **Dynamic navigation & layout**
    - Replace hard-coded cards with `ScopeNav` component that renders buttons/tabs from the metadata.
    - Maintain ARIA attributes and active-state handling for accessibility.

14. **Dynamic filter form**
    - Build `ScopeFilterForm` that inspects filter descriptors (text, select, date, enum) and renders appropriate controls.
    - Support validation and default selections based on metadata; surface changes back to `useScopeSearch`.

15. **Dynamic results table**
    - Implement `ScopeResultsTable` that uses column descriptors to render headers and cells (formatters, value accessors).
    - Handle empty states, loading indicators, and row-level key selection generically.

16. **Update main shell**
    - Refactor `web/src/App.tsx` to use the new hooks/components.
    - Ensure error banners, pagination, and summaries derive copy from scope metadata rather than hard-coded strings.
    - Keep compatibility with existing customer flow while other scopes are phased in.

17. **Frontend testing**
    - Extend Vitest tests to mock metadata responses and validate dynamic rendering paths (filters, nav, table).
    - Add integration/e2e smoke tests for multi-scope navigation when browser automation is available.

## Phase 5 – Migration & Rollout
18. **Backfill metadata for customers**
    - Convert existing SQL logic into metadata definitions.
    - Verify generated SQL matches current queries (snapshot comparison).

19. **Pilot additional scope**
    - Onboard one extra scope (e.g., Product) to validate metadata ergonomics front-to-back.
    - Capture lessons-learned and iterate before onboarding the rest.

16. **Documentation & handover**
    - Update `README.md` and `09_source_architecture.md` to describe the new module.
    - Produce runbook describing how to add/modify scope metadata, including validation commands and review checklist.

17. **Deployment plan**
    - Release behind feature flags or toggle via environment variable (`ENABLE_METADATA_SEARCH`).
    - Monitor logs for generated SQL and performance; add dashboards if available.

## Verification Checklist
- [ ] Metadata files validated in CI and during local dev.
- [ ] Dynamic SQL output unit-tested for every operator/product scope.
- [ ] API contract documented and covered by integration tests.
- [ ] Frontend integrates with new endpoints without regressions.
- [ ] Operational runbook published.
- [ ] Feature flag or gradual rollout strategy executed.

