import express, { Request, Response, NextFunction, Router } from 'express';
import path from 'node:path';
import cors, { CorsOptions } from 'cors';
import { DatabaseProvider } from './bootstrap/databaseProvider';
import { CustomerRepository } from './features/customers/customerRepository';
import { CustomerService } from './features/customers/customerService';
import { createCustomersRouter } from './features/customers/customerRoutes';

type AppConfig = {
  allowedOrigins?: string[];
};

type AppDependencies = {
  customersRouter?: Router;
};

const buildCorsOptions = (allowedOrigins?: string[]): CorsOptions => {
  if (!allowedOrigins || allowedOrigins.length === 0) {
    return { origin: true, credentials: true };
  }

  return {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origin not allowed by CORS policy'));
    },
    credentials: true
  };
};

const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ message: err.message ?? 'Unexpected error' });
};

const createApp = (config: AppConfig = {}, dependencies: AppDependencies = {}) => {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());
  app.use(cors(buildCorsOptions(config.allowedOrigins)));

  const publicDir = path.resolve(__dirname, 'public');
  app.use(express.static(publicDir));

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/customers', dependencies.customersRouter ?? createCustomersModule());

  app.get('*', (_req, res, next) => {
    if (_req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'), (err) => {
      if (err) {
        next(err);
      }
    });
  });

  app.use(errorHandler);

  return app;
};

const createCustomersModule = (): Router => {
  const databaseProvider = new DatabaseProvider();
  const repository = new CustomerRepository(() => databaseProvider.getClient());
  const service = new CustomerService(repository);
  return createCustomersRouter(service);
};

export type { AppConfig, AppDependencies };
export default createApp;

