To switch between Customers and Suppliers, we’ll need both UI changes (tab state, supplier filters/table) and backend support (an API endpoint that returns suppliers with the required fields). Before I start coding, I need a bit more information:

1. **Data source** – Which table(s) and columns should we use for suppliers (name, number, phone, email, address, city, state, zip, country, website, etc.)? Please share the exact schema or view you want us to query.
2. **API contract** – Do we already have a `/api/suppliers` endpoint, or should I build a new one? If it exists, what does the payload look like (request filters, response shape)? If not, I’ll need the expected behavior so the UI can call it.
3. **Filters and pagination** – Should supplier search behave exactly like customers (live fetch on tab change, same pagination size, etc.), or do we have different rules (sorting, default filters)?
4. **Additional fields** – Any other supplier metadata we should show in the results grid (contacts, industry, last order, etc.)?

Once I have those details, I’ll put together a small plan for the backend and frontend, check it with you, and then implement the Suppliers view.