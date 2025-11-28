# MVP Data Access Architecture

## Overview
- Objective: deliver a single, maintainable data-access layer that powers the dashboard cards and on-demand scope searches (Customers, Suppliers, Customer Orders, Purchase Orders, Manufacturing Orders, Products) without hard-coded repositories or inline SQL.
- Initial UX: dashboard displays entity counts; clicking a card reveals scope-specific search controls and a paginated result grid. Initial state shows no rows plus a `Show All` action.
- Key requirement: dynamically assemble queries from any combination of user-specified criteria while keeping implementation low-maintenance and configuration-driven.

## Required Analysis Inputs
- **Entity inventory:** full list of present/future scopes, their business owners, and lifecycle considerations.
- **Schema & relationships:** logical/physical models, primary keys, join paths, allowed join types, nullable foreign keys.
- **Search semantics:** for every scope, list filters, data types, operators (equals, contains, ranges, enums, tags), AND/OR rules, default values, and multi-select behavior.
- **Pagination & sorting:** default sort columns, configurable sort options, maximum page size, total-count requirements.
- **Security constraints:** tenant or role filters, field-level visibility, redaction/masking needs, audit obligations.
- **Performance guardrails:** target latency, concurrency, expected dataset sizes, index limitations, caching windows, acceptable stale-data windows for counts.
- **Change cadence:** how often fields/scopes change, who edits metadata, promotion/deployment workflow for metadata updates.

## Best-Practice Architecture
- **Metadata-driven service layer:** maintain a single `DataScope` registry (JSON/YAML/DB) describing fields, filters, joins, default sorts, and display labels for each scope.
- **Generic query builder:** implement a reusable component (e.g., based on Knex, Prisma QueryBuilder, or TypeORM QueryBuilder) that consumes `DataScope` metadata and user payloads to produce parameterized SQL.
- **Filter specifications:** map each filter to a composable predicate function that enforces type validation, operator support, and security checks before feeding into the builder.
- **Unified API contract:** expose endpoints such as `POST /search/{scope}` that accept a structured payload `{filters, sort, pagination}`. Service validates payload against metadata, builds SQL, executes it, and returns paginated data + total counts.
- **Dashboard totals:** reuse metadata definitions to generate count queries per scope; consider pre-aggregated/materialized views if latency budget is tight.
- **Cross-cutting concerns:** centralize authentication, authorization, caching, and logging in middleware around the generic service to avoid duplication.

## Out-of-the-Box / Low-Maintenance Options
- **Metadata-first engine:** treat every aspect (form schema, validation, query assembly, response shaping) as metadata-driven; updating metadata (not code) introduces new scopes or filters.
- **OData/GraphQL façade:** allow clients to send structured filter/sort expressions; backend interprets via schema-resolvers that map directly to SQL through the builder, eliminating hand-written endpoints.
- **Custom DSL:** define a compact JSON DSL describing fields, operators, and joins. Parse into an AST that the query builder executes; DSL definitions live alongside metadata for rapid evolution.
- **Headless analytics platform:** leverage engines such as Cube.js, Hasura, or Superset as the metadata/query orchestration layer, keeping custom code to orchestration, auth, and UI.
- **Hybrid caching:** pair dynamic querying with materialized views or cached aggregates for heavy scopes; metadata dictates when to pull from cache versus live query.

## Next Steps
- Gather the analysis inputs above and document them in the requirements folder.
- Draft an initial `DataScope` metadata schema (fields, filters, joins) as a living contract between product, data, and engineering.
- Prototype the generic query builder with one or two scopes to validate payload shape, metadata ergonomics, and performance.
- Define governance for metadata updates (reviewers, validation tooling, rollout plan) to keep the system low-maintenance over time.

