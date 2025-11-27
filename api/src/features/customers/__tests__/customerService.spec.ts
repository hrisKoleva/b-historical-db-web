import { CustomerService } from '../customerService';

describe('CustomerService', () => {
  const mockRepository = () => {
    return {
      search: jest.fn()
    };
  };

  it('applies pagination defaults and forwards criteria', async () => {
    const repository = mockRepository();
    repository.search.mockResolvedValue({
      total: 40,
      customers: [
        {
          customerNumber: '001',
          name: 'Hyundai Heavy',
          phone: '12345678',
          vatNumber: 'VAT',
          orderCount: 3,
          latestOrderDate: '2024-10-05T00:00:00.000Z',
          recentOrders: []
        }
      ]
    });

    const service = new CustomerService(repository as never);

    const result = await service.searchCustomers({ name: 'Hyundai' });

    expect(repository.search).toHaveBeenCalledWith({
      name: 'Hyundai',
      customerNumber: undefined,
      phone: undefined,
      limit: 25,
      offset: 0
    });

    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 25,
      totalRecords: 40,
      totalPages: 2
    });
    expect(result.data).toHaveLength(1);
  });

  it('clamps pagination inputs and calculates offset', async () => {
    const repository = mockRepository();
    repository.search.mockResolvedValue({
      total: 5,
      customers: []
    });

    const service = new CustomerService(repository as never);

    await service.searchCustomers({ page: 3, pageSize: 200, customerNumber: 'C123' });

    expect(repository.search).toHaveBeenCalledWith(
      expect.objectContaining({
        customerNumber: 'C123',
        limit: 100,
        offset: 200
      })
    );
  });
});

