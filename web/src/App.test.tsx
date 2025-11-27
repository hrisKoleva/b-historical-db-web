import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const createResponse = (payload: unknown): Promise<Response> =>
  Promise.resolve({
    ok: true,
    json: async () => payload
  } as Response);

const sampleCustomer = {
  customerNumber: '001',
  name: 'Hyundai Heavy',
  phone: '12345678',
  vatNumber: 'VAT-001',
  orderCount: 42,
  recentOrders: [
    { orderNumber: '0000001', customerOrderNumber: 'A123' },
    { orderNumber: '0000002', customerOrderNumber: 'A124' }
  ]
};

describe('App', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('loads the default query and renders the customer grid', async () => {
    const mockFetch = vi.fn().mockReturnValueOnce(
      createResponse({
        data: [sampleCustomer, { ...sampleCustomer, customerNumber: '002', name: 'Hyundai B' }],
        pagination: {
          page: 1,
          pageSize: 25,
          totalRecords: 2,
          totalPages: 1
        }
      })
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    render(<App />);

    const numbers = await screen.findAllByLabelText('Customer number');
    expect(numbers[0]).toHaveTextContent('001');
    expect(numbers).toHaveLength(2);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[0]).toContain('/api/customers');
    expect(screen.getByText('Hyundai Heavy')).toBeInTheDocument();
    const orderCells = screen.getAllByLabelText('Order number');
    const customerOrderCells = screen.getAllByLabelText('Customer order number');
    expect(orderCells[0]).toHaveTextContent('0000001');
    expect(customerOrderCells[0]).toHaveTextContent('A123');
    expect(screen.getAllByText('Showing 1–2 of 2 customers')).toHaveLength(2);
  });

  it('requests the next page when Next is clicked', async () => {
    const firstPage = {
      data: [sampleCustomer],
      pagination: {
        page: 1,
        pageSize: 25,
        totalRecords: 60,
        totalPages: 3
      }
    };
    const secondPage = {
      data: [{ ...sampleCustomer, customerNumber: '003', name: 'Hyundai Marine' }],
      pagination: {
        page: 2,
        pageSize: 25,
        totalRecords: 60,
        totalPages: 3
      }
    };

    const mockFetch = vi
      .fn()
      .mockReturnValueOnce(createResponse(firstPage))
      .mockReturnValueOnce(createResponse(secondPage));

    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<App />);
    await waitFor(() => expect(screen.getByText('Hyundai Heavy')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => expect(screen.getByText('Hyundai Marine')).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const summaries = screen.getAllByText('Showing 26–50 of 60 customers');
    expect(summaries).toHaveLength(2);
  });

  it('displays an error banner when the API call fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({})
    } as Response);

    globalThis.fetch = mockFetch as unknown as typeof fetch;

    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'We could not load customers right now. Please try again.'
      )
    );
  });
});

