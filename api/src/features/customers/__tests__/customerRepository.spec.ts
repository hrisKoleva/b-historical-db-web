import { SqlClient } from '../../../infrastructure/sqlClient';
import { CustomerRepository } from '../customerRepository';

const createClientStub = () => {
  const query = jest.fn();
  return {
    client: { query } as unknown as SqlClient,
    query
  };
};

describe('CustomerRepository', () => {
  it('maps SQL rows into domain objects and applies filters', async () => {
    const { client, query } = createClientStub();
    query
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        {
          customerNumber: '000123',
          customerName: 'Hyundai Heavy',
          phone: '12345678',
          vat: 'VATNO',
          orderCount: 3,
          latestOrderDate: '2024-10-05T00:00:00.000Z',
          recentOrdersJson: '[{"orderNumber":"ORD-1","orderDate":"2024-09-01"}]'
        }
      ]);

    const repository = new CustomerRepository(async () => client);

    const result = await repository.search({
      name: 'Hyundai',
      phone: undefined,
      customerNumber: undefined,
      limit: 25,
      offset: 0
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('COUNT(*)'),
      expect.objectContaining({ namePattern: '%Hyundai%' })
    );

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FOR JSON PATH'),
      expect.objectContaining({
        limit: 25,
        offset: 0,
        namePattern: '%Hyundai%'
      })
    );

    expect(result.total).toBe(1);
    expect(result.customers).toEqual([
      {
        customerNumber: '000123',
        name: 'Hyundai Heavy',
        phone: '12345678',
        vatNumber: 'VATNO',
        orderCount: 3,
        latestOrderDate: '2024-10-05T00:00:00.000Z',
        recentOrders: [{ orderNumber: 'ORD-1', orderDate: '2024-09-01', customerOrderNumber: undefined }]
      }
    ]);
  });

  it('returns empty arrays when no rows are returned and handles invalid JSON gracefully', async () => {
    const { client, query } = createClientStub();
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([
      {
        customerNumber: '000123',
        customerName: 'Unknown',
        phone: null,
        vat: null,
        orderCount: null,
        latestOrderDate: null,
        recentOrdersJson: 'INVALID JSON'
      }
    ]);

    const repository = new CustomerRepository(async () => client);
    const result = await repository.search({
      limit: 10,
      offset: 0
    });

    expect(result.total).toBe(0);
    expect(result.customers[0].recentOrders).toEqual([]);
  });
});

