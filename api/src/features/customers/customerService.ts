import {
  CustomerRepository,
  CustomerSearchCriteria,
  CustomerSummary
} from './customerRepository';

export type CustomerSearchInput = {
  name?: string;
  customerNumber?: string;
  phone?: string;
  page?: number;
  pageSize?: number;
};

export type CustomerSearchResponse = {
  data: CustomerSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
};

const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

export class CustomerService {
  constructor(private readonly repository: CustomerRepository) {}

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
}

const normalizePage = (page?: number): number => {
  if (!page || Number.isNaN(page) || page < 1) {
    return 1;
  }
  return Math.floor(page);
};

const normalizePageSize = (pageSize?: number): number => {
  if (!pageSize || Number.isNaN(pageSize)) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.max(MIN_PAGE_SIZE, Math.min(MAX_PAGE_SIZE, Math.floor(pageSize)));
};

