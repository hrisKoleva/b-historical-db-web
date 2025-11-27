import { SqlClient } from '../../infrastructure/sqlClient';

export type CustomerSearchCriteria = {
  name?: string;
  customerNumber?: string;
  phone?: string;
  limit: number;
  offset: number;
};

type CustomerRow = {
  customerNumber: string;
  customerName: string;
  phone: string | null;
  vat: string | null;
  orderCount: number | null;
  latestOrderDate: string | null;
  recentOrdersJson: string | null;
};

export type CustomerSummary = {
  customerNumber: string;
  name: string;
  phone?: string;
  vatNumber?: string;
  orderCount: number;
  latestOrderDate?: string;
  recentOrders: Array<{
    orderNumber: string;
    customerOrderNumber?: string;
    orderDate?: string;
  }>;
};

export type CustomerSearchResult = {
  total: number;
  customers: CustomerSummary[];
};

const SCHEMA = 'M3FDBPRD';

export class CustomerRepository {
  constructor(private readonly clientFactory: () => Promise<SqlClient>) {}

  async search(criteria: CustomerSearchCriteria): Promise<CustomerSearchResult> {
    const client = await this.clientFactory();
    const baseParameters = {
      namePattern: criteria.name ? `%${criteria.name}%` : null,
      customerNumber: criteria.customerNumber ?? null,
      phone: criteria.phone ?? null
    };

    const [{ total = 0 } = { total: 0 }] = await client.query<{ total: number }>(
      CUSTOMER_COUNT_QUERY,
      baseParameters
    );

    const rows = await client.query<CustomerRow>(CUSTOMER_DATA_QUERY, {
      ...baseParameters,
      limit: criteria.limit,
      offset: criteria.offset
    });

    return {
      total,
      customers: rows.map(mapRowToSummary)
    };
  }
}

const CUSTOMER_COUNT_QUERY = `
SELECT COUNT(*) AS total
FROM ${SCHEMA}.OCUSMA AS cus
WHERE (@customerNumber IS NULL OR cus.OKCUNO = @customerNumber)
  AND (@namePattern IS NULL OR cus.OKCUNM LIKE @namePattern)
  AND (@phone IS NULL OR cus.OKPHNO = @phone);
`;

const CUSTOMER_DATA_QUERY = `
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
  cus.OKPHNO AS phone,
  cus.OKVTCD AS vat,
  orders.OrderCount AS orderCount,
  orders.LatestOrderDate AS latestOrderDate,
  recentOrders.recentOrdersJson AS recentOrdersJson
FROM ${SCHEMA}.OCUSMA AS cus
LEFT JOIN CustomerOrders AS orders ON orders.CustomerNumber = cus.OKCUNO
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
  AND (@namePattern IS NULL OR cus.OKCUNM LIKE @namePattern)
  AND (@phone IS NULL OR cus.OKPHNO = @phone)
ORDER BY cus.OKCUNM
OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
`;

const mapRowToSummary = (row: CustomerRow): CustomerSummary => {
  return {
    customerNumber: row.customerNumber,
    name: row.customerName,
    phone: row.phone ?? undefined,
    vatNumber: row.vat ?? undefined,
    orderCount: row.orderCount ?? 0,
    latestOrderDate: row.latestOrderDate ?? undefined,
    recentOrders: parseRecentOrders(row.recentOrdersJson)
  };
};

const parseRecentOrders = (
  payload: string | null
): Array<{ orderNumber: string; customerOrderNumber?: string; orderDate?: string }> => {
  if (!payload) {
    return [];
  }

  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((order) => ({
      orderNumber: typeof order.orderNumber === 'string' ? order.orderNumber : '',
      customerOrderNumber:
        typeof order.customerOrderNumber === 'string' ? order.customerOrderNumber : undefined,
      orderDate: typeof order.orderDate === 'string' ? order.orderDate : undefined
    }));
  } catch {
    return [];
  }
};

