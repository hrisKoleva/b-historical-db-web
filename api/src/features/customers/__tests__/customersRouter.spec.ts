import express from 'express';
import request from 'supertest';
import { createCustomersRouter } from '../customerRoutes';

describe('customers router', () => {
  it('forwards query parameters to the service and returns payload', async () => {
    const service = {
      searchCustomers: jest.fn().mockResolvedValue({
        data: [
          {
            customerNumber: '001',
            name: 'Hyundai Heavy',
            phone: '12345678',
            vatNumber: 'VAT',
            orderCount: 3,
            latestOrderDate: '2024-10-05T00:00:00.000Z',
            recentOrders: []
          }
        ],
        pagination: {
          page: 2,
          pageSize: 10,
          totalRecords: 12,
          totalPages: 2
        }
      })
    };

    const app = express();
    app.use('/customers', createCustomersRouter(service as never));

    const response = await request(app).get(
      '/customers?name=hyundai&customerNumber=001&page=2&pageSize=10'
    );

    expect(response.status).toBe(200);
    expect(service.searchCustomers).toHaveBeenCalledWith({
      name: 'hyundai',
      customerNumber: '001',
      phone: undefined,
      page: 2,
      pageSize: 10
    });
    expect(response.body).toEqual({
      data: [
        {
          customerNumber: '001',
          name: 'Hyundai Heavy',
          phone: '12345678',
          vatNumber: 'VAT',
          orderCount: 3,
          latestOrderDate: '2024-10-05T00:00:00.000Z',
          recentOrders: []
        }
      ],
      pagination: {
        page: 2,
        pageSize: 10,
        totalRecords: 12,
        totalPages: 2
      }
    });
  });
});

