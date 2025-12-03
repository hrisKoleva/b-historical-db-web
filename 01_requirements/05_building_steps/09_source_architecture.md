# Source Architecture Overview

## Monorepo Layout
- Two workspaces managed from the root: `api/` for the backend and `web/` for the React front-end. A root script keeps dependency management simple (`npm run install:all`).
- Shared requirement assets (logos, prompts, requirements docs) live under `01_requirements/`, and the front-end consumes branding assets directly through Vite path aliases.

## Backend (api/)
- **Runtime stack:** Express + TypeScript, compiled with `tsc` and launched via `ts-node-dev` during development. Strict compiler options enforce type safety.
- **App bootstrap:** `createApp` wires CORS, JSON parsing, health endpoint, static hosting for the built SPA, and feature routers. Default dependencies keep the entry point declarative, aiding testability.

```45:74:api/src/app.ts
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/customers', dependencies.customersRouter ?? createCustomersModule());
```

- **Feature composition:** `createCustomersModule` constructs a feature graph (DatabaseProvider → CustomerRepository → CustomerService → router) on demand. This isolates wiring logic and keeps Express concerns and business logic separated.

```70:75:api/src/app.ts
const createCustomersModule = (): Router => {
  const databaseProvider = new DatabaseProvider();
  const repository = new CustomerRepository(() => databaseProvider.getClient());
  const service = new CustomerService(repository);
  return createCustomersRouter(service);
};
```

- **Configuration & secrets:** `DatabaseProvider` wraps connection resolution, preferring direct env inputs but falling back to Azure Key Vault. It memoises the resolved connection and the `SqlClient` to avoid repeated setup work.

```49:81:api/src/bootstrap/databaseProvider.ts
  private async resolveConnectionInfo(): Promise<ConnectionInfo> {
    if (this.connectionInfo) {
      return this.connectionInfo;
    }

    if (this.config.server && this.config.database) {
      this.connectionInfo = {
        server: this.config.server,
        database: this.config.database,
        user: this.config.sqlAuthUser,
        password: this.config.sqlAuthPassword
      };
      return this.connectionInfo;
    }

    if (this.config.serverSecretName && this.config.databaseSecretName) {
      const provider = this.ensureSecretProvider();
      const [server, database] = await Promise.all([
        provider.getSecretValue(this.config.serverSecretName),
        provider.getSecretValue(this.config.databaseSecretName)
      ]);
      this.connectionInfo = {
        server,
        database,
        user: this.config.sqlAuthUser,
        password: this.config.sqlAuthPassword
      };
      return this.connectionInfo;
    }

    throw new Error(
      'SQL connection configuration is incomplete. Provide direct values or Key Vault secret names.'
    );
  }
```

- **SQL access:** `SqlClient` centralises access token handling and pools connections. Token refresh errors trigger a single retry with a fresh pool, so consumers remain oblivious to auth plumbing.

```69:123:api/src/infrastructure/sqlClient.ts
  private async createPool(): Promise<ConnectionPool> {
    const commonConfig: Pick<SqlConfig, 'server' | 'database' | 'options'> = {
      server: this.options.server,
      database: this.options.database,
      options: {
        encrypt: this.options.encrypt ?? true,
        trustServerCertificate: false
      }
    };

    let config: SqlConfig;

    if (this.usingSqlAuth()) {
      config = {
        ...commonConfig,
        user: this.options.user,
        password: this.options.password
      } as SqlConfig;
    } else {
      const token = await this.options.tokenProvider();
      config = {
        ...commonConfig,
        authentication: {
          type: 'azure-active-directory-access-token',
          options: {
            token
          }
        }
      } as SqlConfig;
    }

    const pool = new ConnectionPool(config);
    await pool.connect();
    return pool;
  }
```

- **Feature logic:** The customer search feature layers responsibilities:
  - `CustomerService` normalises inputs, controls pagination bounds, and shapes the API response to the front-end contract.
  - `CustomerRepository` executes two SQL statements (count + paginated data) and maps DB rows into domain objects, protecting the rest of the app from SQL details.

```29:52:api/src/features/customers/customerService.ts
  async searchCustomers(input: CustomerSearchInput): Promise<CustomerSearchResponse> {
    const page = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    const criteria: CustomerSearchCriteria = {
      name: input.name,
      customerNumber: input.customerNumber,
      phone: input.phone,
      limit: pageSize,
      offset: (page - 1) * pageSize
    };

    const result = await this.repository.search(criteria);

    return {
      data: result.customers,
      pagination: {
        page,
        pageSize,
        totalRecords: result.total,
        totalPages: result.total === 0 ? 0 : Math.ceil(result.total / pageSize)
      }
    };
  }
```

- The repository leverages `OUTER APPLY ... FOR JSON PATH` to materialise recent orders, keeping SQL round-trips minimal while still returning nested data.

```80:113:api/src/features/customers/customerRepository.ts
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
OUTER APPLY (
  SELECT TOP (5)
    head.OAORNO AS orderNumber,
    head.OACUOR AS customerOrderNumber,
    head.OAORDT AS orderDate
  FROM ${SCHEMA}.OOHEAD AS head
  WHERE head.OACUNO = cus.OKCUNO
  ORDER BY head.OAORDT DESC
  FOR JSON PATH
) AS recentOrders(recentOrdersJson)
WHERE (@customerNumber IS NULL OR cus.OKCUNO = @customerNumber)
```

- **Testing strategy:** Jest exercises infrastructure adapters (token provider, Key Vault client, SQL client), bootstrap wiring, and the customer feature end-to-end. These tests justify the separation of concerns and ensure token caching, secret caching, and pagination semantics behave as designed.

```20:51:api/src/__tests__/infrastructure/azureSqlTokenProvider.spec.ts
describe('AzureSqlTokenProvider', () => {
  it('returns cached token while still valid', async () => {
    ...
  });

  it('refreshes token when about to expire', async () => {
    ...
  });
});
```

## Front-end (web/)
- **Runtime stack:** React 18 + Vite, TypeScript strict mode, and Vitest + Testing Library for UI tests.
- **Entry point:** `main.tsx` loads global styles and enforces presence of the root node to fail fast in misconfigured deployments.

```1:17:web/src/main.tsx
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- **App structure:** The current MVP focuses on the customer search experience with branded header, navigation placeholders, form, results table, and pagination controls. Fetch logic is encapsulated in a `useCallback` with abort support to avoid stale request updates.

```36:114:web/src/App.tsx
const App = () => {
  const [nameQuery, setNameQuery] = useState('Hyundai');
  ...
  const fetchCustomers = useCallback(
    async (targetPage: number) => {
      const controller = new AbortController();
      setIsLoading(true);
      setError(null);

      try {
        const searchParams = new URLSearchParams();
        if (nameQuery.trim().length > 0) {
          searchParams.set('name', nameQuery.trim());
        }
        ...
        const response = await fetch(`/api/customers?${searchParams.toString()}`, {
          signal: controller.signal
        });
        ...
      } finally {
        setIsLoading(false);
      }
    },
    [nameQuery]
  );
```

- **Styling:** Global design tokens are centralised in CSS variables. Layout classes provide card-based dashboard styling, anticipating future scope navigation by already defining `.nav-card*` patterns.

```1:128:web/src/styles/global.css
@import url('https://fonts.googleapis.com/css2?family=Aleo:wght@400;600;700&display=swap');

::root {
  color-scheme: light;
  --color-background: #f5f7fb;
  --color-surface: #ffffff;
  --color-primary: #0b4f9c;
  ...
}

.nav-card[aria-current='true'] {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
  box-shadow: 0 14px 26px -24px rgba(11, 79, 156, 0.85);
}
```

- **Testing:** Vitest verifies that API responses drive the UI (rendering rows, handling interactions). This ensures the front-end contract with the backend remains stable.

```39:59:web/src/App.test.tsx
it('submits customer search and renders results', async () => {
  render(<App />);
  ...
  await waitFor(() => {
    expect(screen.getByText(/Hyundai Heavy/i)).toBeInTheDocument();
  });
  expect(screen.getByText('0000001')).toBeInTheDocument();
  expect(screen.getByText('0000002')).toBeInTheDocument();
});
```

- **Tooling:** Vite config defines aliases to `@assets` pointing at shared branding assets in `01_requirements/logos`, keeping the design source-of-truth close to requirements while retaining type-safe imports. The dev server proxies `/api` to the Node backend for a cohesive DX.

```5:24:web/vite.config.ts
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@styles': fileURLToPath(new URL('./src/styles', import.meta.url)),
      '@assets': fileURLToPath(new URL('../01_requirements/logos', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    },
    fs: {
      allow: ['..', '../01_requirements/logos']
    }
  },
  ...
});
```

## Rationale Summary
- **Separation of concerns:** Backend feature wiring and repository layers isolate SQL knowledge, enabling future plug-in of dynamic query builders without touching routing or service contracts.
- **Cloud-first infrastructure:** Azure identity and Key Vault integrations are encapsulated, minimising surface area that must change when deployment credentials rotate.
- **Testability:** Dependency injection points (`createApp` dependencies, `CustomerRepository` client factory) exist largely to keep unit and integration tests deterministic.
- **Front-end preparedness:** UI scaffolding already reflects the planned dashboard (navigation cards, summary/pagination components), reducing churn when additional scopes arrive.
- **Maintainability:** Centralised config helpers (`env.ts`, Vite aliases) and strict TypeScript settings enforce consistency, while reuse of metadata (CSS tokens, service response shape) limits duplication.

## Future Considerations
- Generalise the repository/service pattern into a metadata-driven search module as the project expands beyond customers.
- Extend existing tests into contract tests between `web` and `api` by mocking fetch against actual server responses.
- Introduce infrastructure automation (e.g., GitHub Actions) when deployment details are available—the README already anticipates this workflow.

### Metadata-Driven Search Module Blueprint
- **Define scope metadata:** Create a configuration source (JSON/YAML/DB table) describing each data scope: base table/view, display name, supported filters (field, operator, data type, optional value lookup), default sort, selectable columns, and joins required to hydrate nested data.
- **Normalise filter grammar:** Settle on a canonical request payload `{ scope, filters, sort, pagination }` where each filter references a metadata key (e.g., `{"field":"customerName","operator":"contains","value":"Hyundai"}`). Keep operators constrained to an allow-list declared in metadata to block injection.
- **Generic query builder:** Replace scope-specific SQL with a builder that reads the metadata and composes SQL using a safe abstraction (Knex/TypeORM QueryBuilder or a custom builder). Steps: resolve base query, apply required joins, apply filters (mapping metadata operator to SQL predicate), apply sorting, and emit pagination clauses. Fallback to pre-authored SQL snippets only when metadata calls for advanced constructs (e.g., JSON aggregation).
- **Resolver/service layer:** Introduce a `SearchService` that accepts the canonical payload, validates filters against metadata, injects common constraints (tenant, soft-deletes), then delegates to the builder. This service returns a consistent envelope `{ data, pagination, diagnostics }`, so the front-end never changes when a new scope is added.
- **Repository abstraction:** Collapse `CustomerRepository` into a generic `MetadataSearchRepository`. It receives `ScopeDefinition` + user payload, instantiates/query builder, and maps raw rows to response models using metadata-provided transformers (e.g., to parse JSON columns or format currency).
- **Dashboard counts:** Use the same metadata to generate aggregate queries. Each scope definition can include a `countStrategy` (simple `COUNT(*)`, filtered counts, or materialized view reference).
- **Validation & testing:** Add unit tests per scope metadata to guarantee all declared fields exist, operators map to supported SQL fragments, and generated SQL includes pagination + column projection. Integration tests can loop through registered scopes, running snapshot or golden tests against a seeded database.
- **Operational workflow:** Store metadata close to the codebase for versioning (e.g., `api/src/metadata/scopes/*.json`). Provide a schema definition plus lint/test step that validates metadata during CI, keeping the codebase low-maintenance even as scopes grow.

