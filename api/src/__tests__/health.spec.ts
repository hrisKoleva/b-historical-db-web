import express from 'express';
import request from 'supertest';
import createApp from '../app';

describe('GET /api/health', () => {
  it('responds with ok status payload', async () => {
    const app = createApp({}, { customersRouter: express.Router() });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

