import { Router } from 'express';
import { CustomerService, CustomerSearchInput } from './customerService';

export const createCustomersRouter = (service: CustomerService): Router => {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const input = extractSearchInput(req.query);
      const result = await service.searchCustomers(input);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
};

const extractSearchInput = (query: Record<string, unknown>): CustomerSearchInput => {
  const parseNumber = (value: unknown) => {
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  };

  const parseString = (value: unknown) => {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return undefined;
  };

  return {
    name: parseString(query.name),
    customerNumber: parseString(query.customerNumber),
    phone: parseString(query.phone),
    page: parseNumber(query.page),
    pageSize: parseNumber(query.pageSize)
  };
};

