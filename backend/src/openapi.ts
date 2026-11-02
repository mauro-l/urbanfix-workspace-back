// OpenAPI contract for the UrbanFix API.
// Single source of truth: add every new route here so Swagger UI stays accurate.

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'UrbanFix API',
    version: '1.0.0',
    description:
      'Home services marketplace API. Clients publish service requests and technicians accept them.',
  },
  servers: [
    { url: 'http://localhost:3001', description: 'Local development' },
    {
      url: 'https://urbanfix-api-6e8o.onrender.com',
      description: 'Production (Render)',
    },
  ],
  tags: [
    { name: 'Health', description: 'Liveness of the API process' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Check that the API process is running',
        description:
          'Returns 200 while the process is alive. It does not touch the database, so a 200 does not prove Neon is reachable.',
        operationId: 'getHealth',
        responses: {
          '200': {
            description: 'The API process is running',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Health' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Health: {
        type: 'object',
        required: ['status', 'timestamp'],
        properties: {
          status: { type: 'string', example: 'ok' },
          timestamp: {
            type: 'string',
            format: 'date-time',
            example: '2026-11-02T21:49:37.524Z',
          },
        },
      },
    },
  },
};
