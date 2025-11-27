import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import klingerLogo from '@assets/KLINGERWestad_hires.png';
import upkipLogo from '@assets/Upkip-brand-assets-gray-2048x559.png';
const PAGE_SIZE = 25;
const DEFAULT_QUERY = 'Hyundai';
const buildSearchQuery = (name, page) => {
    const params = new URLSearchParams();
    if (name.trim().length > 0) {
        params.set('name', name.trim());
    }
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    return `/api/customers?${params.toString()}`;
};
const formatRange = (page, total, pageSize) => {
    if (total === 0) {
        return 'Showing 0 results';
    }
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} customers`;
};
const extractOrderNumbers = (orders) => {
    return orders
        .map((order) => order.orderNumber)
        .filter((value) => typeof value === 'string' && value.trim().length > 0);
};
const extractCustomerOrderNumbers = (orders) => {
    return orders
        .map((order) => order.customerOrderNumber)
        .filter((value) => typeof value === 'string' && value.trim().length > 0);
};
const App = () => {
    const [formValue, setFormValue] = useState(DEFAULT_QUERY);
    const [currentQuery, setCurrentQuery] = useState(DEFAULT_QUERY);
    const [page, setPage] = useState(1);
    const [customers, setCustomers] = useState([]);
    const [total, setTotal] = useState(0);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    useEffect(() => {
        const controller = new AbortController();
        const loadCustomers = async () => {
            setStatus('loading');
            setError(null);
            try {
                const response = await fetch(buildSearchQuery(currentQuery, page), {
                    signal: controller.signal
                });
                if (!response.ok) {
                    throw new Error('We could not load customers right now. Please try again.');
                }
                const payload = (await response.json());
                setCustomers(payload.data);
                setTotal(payload.pagination.totalRecords);
                setStatus('success');
            }
            catch (cause) {
                if (controller.signal.aborted) {
                    return;
                }
                const message = cause instanceof Error
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
    const summaryText = useMemo(() => formatRange(page, total, PAGE_SIZE), [page, total]);
    const handleSubmit = (event) => {
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
    return (_jsxs("div", { className: "app-shell", "data-testid": "app-shell", children: [_jsxs("header", { className: "app-header", children: [_jsx("img", { src: klingerLogo, alt: "KLINGER Westad logo", className: "brand-logo" }), _jsxs("div", { className: "app-header__text", children: [_jsx("h1", { children: "Historical Database Portal" }), _jsx("p", { children: "Search and explore KLINGER Westad history with Azure SQL intelligence. Validate customers, suppliers, and order histories in seconds." })] }), _jsxs("nav", { className: "app-nav", "aria-label": "Primary navigation", children: [_jsx("button", { type: "button", className: "app-nav__item app-nav__item--active", children: "Customers" }), _jsx("button", { type: "button", className: "app-nav__item", children: "Suppliers" }), _jsx("button", { type: "button", className: "app-nav__item", children: "Customer orders" })] }), _jsx("img", { src: upkipLogo, alt: "Upkip logo", className: "app-badge" })] }), _jsxs("main", { className: "app-main", children: [_jsxs("section", { className: "search-card", "aria-labelledby": "search-card-title", children: [_jsx("div", { className: "search-card__header", children: _jsx("h2", { id: "search-card-title", className: "search-card__title", children: "Customer search" }) }), _jsxs("form", { className: "search-form", onSubmit: handleSubmit, children: [_jsxs("div", { className: "search-form__field", children: [_jsx("label", { htmlFor: "customer-name", children: "Customer name" }), _jsx("input", { id: "customer-name", name: "customer-name", type: "text", value: formValue, onChange: (event) => setFormValue(event.target.value), placeholder: "e.g. Hyundai", autoComplete: "name" })] }), _jsx("div", { className: "search-form__actions", children: _jsx("button", { type: "submit", className: "button button--primary", disabled: isLoading, "aria-label": "Search customers", children: isLoading ? 'Searching…' : 'Search' }) })] })] }), _jsxs("section", { className: "results-card", "aria-labelledby": "results-title", children: [_jsxs("div", { className: "results-header", children: [_jsx("h2", { id: "results-title", className: "results-header__title", children: "Customer results" }), _jsx("p", { className: "results-header__meta", children: summaryText })] }), isLoading && (_jsx("div", { className: "status-banner status-banner--info", role: "status", children: "Loading customer data\u2026" })), status === 'error' && error && (_jsx("div", { className: "status-banner status-banner--error", role: "alert", children: error })), showEmptyState && (_jsxs("div", { className: "status-banner status-banner--info", role: "status", children: ["No customers match ", currentQuery ? `"${currentQuery}"` : 'your filters', ". Try another search term."] })), !showEmptyState && customers.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "table-container", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Customer number" }), _jsx("th", { scope: "col", children: "Customer" }), _jsx("th", { scope: "col", children: "Phone" }), _jsx("th", { scope: "col", children: "Number of orders" }), _jsx("th", { scope: "col", children: "Order number" }), _jsx("th", { scope: "col", children: "Customer order number" })] }) }), _jsx("tbody", { children: customers.map((customer) => {
                                                        const orderNumbers = extractOrderNumbers(customer.recentOrders);
                                                        const customerOrderNumbers = extractCustomerOrderNumbers(customer.recentOrders);
                                                        return (_jsxs("tr", { children: [_jsx("td", { "aria-label": "Customer number", children: _jsx("span", { className: "table-cell__title", children: customer.customerNumber }) }), _jsxs("td", { "aria-label": "Customer", children: [_jsx("span", { className: "table-cell__title", children: customer.name }), customer.vatNumber && (_jsxs("span", { className: "table-cell__muted", children: ["VAT ", customer.vatNumber] }))] }), _jsx("td", { "aria-label": "Phone", children: customer.phone ? (_jsx("span", { className: "table-cell__title", children: customer.phone })) : (_jsx("span", { className: "table-cell__muted", children: "Not provided" })) }), _jsx("td", { "aria-label": "Number of orders", children: _jsx("span", { className: "table-cell__title", children: customer.orderCount.toLocaleString() }) }), _jsx("td", { "aria-label": "Order number", children: orderNumbers.length > 0 ? (_jsx("ul", { className: "recent-orders", children: orderNumbers.map((order) => (_jsx("li", { children: _jsx("span", { className: "recent-orders__primary", children: order }) }, order))) })) : (_jsx("span", { className: "table-cell__muted", children: "No recent orders" })) }), _jsx("td", { "aria-label": "Customer order number", children: customerOrderNumbers.length > 0 ? (_jsx("ul", { className: "recent-orders", children: customerOrderNumbers.map((order) => (_jsx("li", { children: _jsx("span", { className: "recent-orders__primary", children: order }) }, order))) })) : (_jsx("span", { className: "table-cell__muted", children: "Not supplied" })) })] }, `${customer.customerNumber}-${customer.name}`));
                                                    }) })] }) }), _jsxs("div", { className: "pagination", children: [_jsx("div", { className: "pagination__summary", children: summaryText }), _jsxs("div", { className: "pagination__controls", children: [_jsx("button", { type: "button", onClick: handlePrev, disabled: disablePrev, children: "Previous" }), _jsx("button", { type: "button", onClick: handleNext, disabled: disableNext, children: "Next" })] })] })] }))] })] })] }));
};
export default App;
