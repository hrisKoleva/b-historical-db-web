import { FormEvent, useEffect, useMemo, useState } from 'react';
import klingerLogo from '@assets/KLINGERWestad_hires.png';
import upkipLogo from '@assets/Upkip-brand-assets-gray-2048x559.png';

const PAGE_SIZE = 25;
const DEFAULT_QUERY = 'Hyundai';

type RecentOrder = {
  orderNumber: string;
  customerOrderNumber?: string;
  orderDate?: string;
};

type CustomerSummary = {
  customerNumber: string;
  name: string;
  phone?: string;
  vatNumber?: string;
  orderCount: number;
  recentOrders: RecentOrder[];
};

type ApiCustomerSearchResponse = {
  data: CustomerSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
};

type FetchState = 'idle' | 'loading' | 'success' | 'error';

const buildSearchQuery = (name: string, page: number) => {
  const params = new URLSearchParams();
  if (name.trim().length > 0) {
    params.set('name', name.trim());
  }
  params.set('page', String(page));
  params.set('pageSize', String(PAGE_SIZE));
  return `/api/customers?${params.toString()}`;
};

const formatRange = (page: number, total: number, pageSize: number) => {
  if (total === 0) {
    return 'Showing 0 results';
  }
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} customers`;
};

const extractOrderNumbers = (orders: RecentOrder[]) => {
  return orders
    .map((order) => order.orderNumber)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
};

const extractCustomerOrderNumbers = (orders: RecentOrder[]) => {
  return orders
    .map((order) => order.customerOrderNumber)
    .filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0
    );
};

const App = () => {
  const [formValue, setFormValue] = useState(DEFAULT_QUERY);
  const [currentQuery, setCurrentQuery] = useState(DEFAULT_QUERY);
  const [page, setPage] = useState(1);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<FetchState>('idle');
  const [error, setError] = useState<string | null>(null);

  const redirectToLogin = () => {
    window.location.href = '/.auth/login/aad?post_login_redirect_uri=/';
  };

  useEffect(() => {
    const controller = new AbortController();

    const loadCustomers = async () => {
      setStatus('loading');
      setError(null);

      try {
        const response = await fetch(buildSearchQuery(currentQuery, page), {
          signal: controller.signal,
          credentials: 'include',
          headers: {
            // Ensures Azure App Service Easy Auth returns HTTP 401/403 instead of a 302 redirect,
            // allowing us to detect an expired session.
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        if (response.status === 401 || response.status === 403 || response.type === 'opaqueredirect') {
          redirectToLogin();
          return;
        }

        if (!response.ok) {
          throw new Error('We could not load customers right now. Please try again.');
        }

        const payload = (await response.json()) as ApiCustomerSearchResponse;
        setCustomers(payload.data);
        setTotal(payload.pagination.totalRecords);
        setStatus('success');
      } catch (cause) {
        if (controller.signal.aborted) {
          return;
        }
        if (cause instanceof TypeError) {
          redirectToLogin();
          return;
        }
        const message =
          cause instanceof Error
            ? cause.message
            : 'We could not load customers right now. Please try again.';
        setCustomers([]);
        setTotal(0);
        setStatus('error');
        setError(message);
      }
    };

    void loadCustomers();

    return () => controller.abort();
  }, [currentQuery, page]);

  const showEmptyState = status === 'success' && customers.length === 0;
  const isLoading = status === 'loading';
  const disablePrev = page === 1 || isLoading;
  const disableNext = isLoading || page * PAGE_SIZE >= total;

  const summaryText = useMemo(
    () => formatRange(page, total, PAGE_SIZE),
    [page, total]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setCurrentQuery(formValue);
  };

  const handlePrev = () => {
    if (page > 1) {
      setPage((previous) => Math.max(previous - 1, 1));
    }
  };

  const handleNext = () => {
    if (!disableNext) {
      setPage((previous) => previous + 1);
    }
  };

  const handleLogout = () => {
    window.location.href = '/.auth/logout?post_logout_redirect_uri=/';
  };

  const navCards: Array<{ label: string; isActive?: boolean }> = [
    { label: 'Customers', isActive: true },
    { label: 'Suppliers' },
    { label: 'Customer orders' },
    { label: 'Purchase orders' },
    { label: 'Manufacturing orders' },
    { label: 'Products' }
  ];

  return (
    <div className="app-shell" data-testid="app-shell">
      <header className="app-header">
        <img src={klingerLogo} alt="KLINGER Westad logo" className="brand-logo" />
        <div className="app-header__text">
          <h1>Historical Database Portal</h1>
          <p>Explore decades of KLINGER Westad history with effortless access to every detail.</p>
        </div>
        <button type="button" className="app-header__logout" onClick={handleLogout}>
          Log out
        </button>
        <img src={upkipLogo} alt="Upkip logo" className="app-badge" />
      </header>

      <main className="app-main">
        <section className="nav-card-row" aria-label="Entity navigation">
          <div className="nav-card-row__grid">
            {navCards.map(({ label, isActive }) => (
              <button
                key={label}
                type="button"
                className="nav-card"
                aria-current={isActive ? 'true' : undefined}
                data-testid="nav-card"
              >
                <span className="nav-card__title">{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="search-card" aria-labelledby="search-card-title">
          <div className="search-card__header">
            <h2 id="search-card-title" className="search-card__title">
              Customer search
            </h2>
          </div>

          <form className="search-form" onSubmit={handleSubmit}>
            <div className="search-form__field">
              <label htmlFor="customer-name">Customer name</label>
              <input
                id="customer-name"
                name="customer-name"
                type="text"
                value={formValue}
                onChange={(event) => setFormValue(event.target.value)}
                placeholder="e.g. Hyundai"
                autoComplete="name"
              />
            </div>

            <div className="search-form__actions">
              <button
                type="submit"
                className="button button--primary"
                disabled={isLoading}
                aria-label="Search customers"
              >
                {isLoading ? 'Searching…' : 'Search'}
              </button>
            </div>
          </form>
        </section>

        <section className="results-card" aria-labelledby="results-title">
          <div className="results-header">
            <h2 id="results-title" className="results-header__title">
              Customer results
            </h2>
            <p className="results-header__meta">{summaryText}</p>
          </div>

          {isLoading && (
            <div className="status-banner status-banner--info" role="status">
              Loading customer data…
            </div>
          )}

          {status === 'error' && error && (
            <div className="status-banner status-banner--error" role="alert">
              {error}
            </div>
          )}

          {showEmptyState && (
            <div className="status-banner status-banner--info" role="status">
              No customers match {currentQuery ? `"${currentQuery}"` : 'your filters'}. Try another
              search term.
            </div>
          )}

          {!showEmptyState && customers.length > 0 && (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Customer number</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Phone</th>
                      <th scope="col">Number of orders</th>
                      <th scope="col">Order number</th>
                      <th scope="col">Customer order number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((customer) => {
                      const orderNumbers = extractOrderNumbers(customer.recentOrders);
                      const customerOrderNumbers = extractCustomerOrderNumbers(
                        customer.recentOrders
                      );

                      return (
                        <tr key={`${customer.customerNumber}-${customer.name}`}>
                          <td aria-label="Customer number">
                            <span className="table-cell__title">{customer.customerNumber}</span>
                          </td>
                          <td aria-label="Customer">
                            <span className="table-cell__title">{customer.name}</span>
                          </td>
                          <td aria-label="Phone">
                            {customer.phone ? (
                              <span className="table-cell__title">{customer.phone}</span>
                            ) : (
                              <span className="table-cell__muted">Not provided</span>
                            )}
                          </td>
                          <td aria-label="Number of orders">
                            <span className="table-cell__title">
                              {customer.orderCount.toLocaleString()}
                            </span>
                          </td>
                          <td aria-label="Order number">
                            {orderNumbers.length > 0 ? (
                              <ul className="recent-orders">
                                {orderNumbers.map((order) => (
                                  <li key={order}>
                                    <span className="recent-orders__primary">{order}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="table-cell__muted">No recent orders</span>
                            )}
                          </td>
                          <td aria-label="Customer order number">
                            {customerOrderNumbers.length > 0 ? (
                              <ul className="recent-orders">
                                {customerOrderNumbers.map((order) => (
                                  <li key={order}>
                                    <span className="recent-orders__primary">{order}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="table-cell__muted">Not supplied</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <div className="pagination__summary">{summaryText}</div>
                <div className="pagination__controls">
                  <button type="button" onClick={handlePrev} disabled={disablePrev}>
                    Previous
                  </button>
                  <button type="button" onClick={handleNext} disabled={disableNext}>
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;

