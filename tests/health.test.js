const request = require('supertest');
const app = require('../app');

describe('Health Check API', () => {
  it('should return 200 OK and success message', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('message', 'Support Ticket API is running');
  });

  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/invalid-route');
    expect(res.statusCode).toEqual(404);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('message', 'Route not found');
  });
});
