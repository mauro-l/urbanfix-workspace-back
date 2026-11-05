// OpenAPI contract for the UrbanFix API.
// Single source of truth: add every new route here so Swagger UI stays accurate.

const errorResponse = { $ref: '#/components/responses/ApiError' };
const pageParameter = { $ref: '#/components/parameters/Page' };
const limitParameter = { $ref: '#/components/parameters/Limit' };
const bearerSecurity = [{ bearerAuth: [] }];
const plannedOperation = 'No funciona, ruta pendiente de implementar.';

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'UrbanFix API',
    version: '1.0.0',
    description:
      'Contrato REST del MVP. Las operaciones que indican que están planificadas aún no están implementadas.',
  },
  // The served spec overrides this with the request origin (see app.ts) so the
  // docs work from localhost, Docker and Render without editing this file.
  servers: [{ url: '/', description: 'Current origin' }],
  tags: [
    { name: 'Health', description: 'Liveness of the API process' },
    { name: 'Auth', description: 'Registro e inicio de sesión' },
    { name: 'Requests', description: 'Solicitudes de servicio' },
    { name: 'Admin', description: 'Consultas administrativas' },
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
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a client or technician',
        description: 'El email se recorta y normaliza a minúsculas. Solo se permiten los roles CLIENTE y TECNICO. Devuelve el perfil público y un JWT.',
        operationId: 'registerUser',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
              example: {
                email: 'ana@example.com',
                password: 'una-clave-segura',
                fullName: 'Ana Pérez',
                phone: '+54 11 5555-0101',
                role: 'CLIENTE',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Usuario creado y autenticado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          '400': errorResponse,
          '409': errorResponse,
          '500': errorResponse,
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and receive a JWT',
        description: 'Una cuenta inactiva no puede autenticarse.',
        operationId: 'loginUser',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
              example: {
                email: 'ana@example.com',
                password: 'una-clave-segura',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Usuario autenticado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          '400': errorResponse,
          '401': errorResponse,
          '500': errorResponse,
        },
      },
    },
    '/api/requests': {
      get: {
        tags: ['Requests'],
        summary: 'List available requests for technicians',
        description: `${plannedOperation} Requiere rol TECNICO. Solo devuelve solicitudes PENDIENTE que este técnico no haya rechazado. No aplica filtros.`,
        operationId: 'listAvailableRequests',
        security: bearerSecurity,
        parameters: [pageParameter, limitParameter],
        responses: {
          '200': {
            description: 'Página de solicitudes disponibles',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RequestListResponse' },
              },
            },
          },
          '400': errorResponse,
          '401': errorResponse,
          '403': errorResponse,
          '500': errorResponse,
        },
      },
      post: {
        tags: ['Requests'],
        summary: 'Create a service request',
        description: `${plannedOperation} Requiere rol CLIENTE. El cliente se toma del JWT; la solicitud nace en estado PENDIENTE.`,
        operationId: 'createRequest',
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateRequest' },
              example: {
                serviceId: '70d2dc01-cb7b-4c7e-8b93-47c46768dc65',
                title: 'Pérdida en la cocina',
                description: 'Gotea la canilla debajo de la mesada.',
                address: 'Av. Siempre Viva 742',
                budget: '15000.00',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Solicitud creada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ServiceRequest' },
              },
            },
          },
          '400': errorResponse,
          '401': errorResponse,
          '403': errorResponse,
          '404': errorResponse,
          '500': errorResponse,
        },
      },
    },
    '/api/requests/mine': {
      get: {
        tags: ['Requests'],
        summary: 'List the authenticated client’s requests',
        description: `${plannedOperation} Requiere rol CLIENTE. Devuelve los estados propios y no aplica filtros.`,
        operationId: 'listMyRequests',
        security: bearerSecurity,
        parameters: [pageParameter, limitParameter],
        responses: {
          '200': {
            description: 'Página de solicitudes propias',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RequestListResponse' },
              },
            },
          },
          '400': errorResponse,
          '401': errorResponse,
          '403': errorResponse,
          '500': errorResponse,
        },
      },
    },
    '/api/requests/{id}/accept': {
      patch: {
        tags: ['Requests'],
        summary: 'Accept a pending request',
        description: `${plannedOperation} Requiere rol TECNICO. La transición debe ser atómica; si la solicitud ya no está disponible o el técnico alcanzó su capacidad, devuelve 409.`,
        operationId: 'acceptRequest',
        security: bearerSecurity,
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Solicitud aceptada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ServiceRequest' },
              },
            },
          },
          '401': errorResponse,
          '403': errorResponse,
          '404': errorResponse,
          '409': errorResponse,
          '500': errorResponse,
        },
      },
    },
    '/api/requests/{id}/reject': {
      patch: {
        tags: ['Requests'],
        summary: 'Reject a request for this technician',
        description: `${plannedOperation} Requiere rol TECNICO. El rechazo queda asociado a la pareja solicitud-técnico; el estado global permanece PENDIENTE y la solicitud sigue visible para los demás técnicos.`,
        operationId: 'rejectRequest',
        security: bearerSecurity,
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RejectRequest' },
              example: { note: 'No tengo disponibilidad para este trabajo.' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Rechazo registrado para este técnico',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RejectResponse' },
              },
            },
          },
          '401': errorResponse,
          '403': errorResponse,
          '404': errorResponse,
          '409': errorResponse,
          '500': errorResponse,
        },
      },
    },
    '/api/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'List users',
        description: `${plannedOperation} Requiere rol ADMIN. Nunca incluye passwordHash. No aplica filtros.`,
        operationId: 'listUsers',
        security: bearerSecurity,
        parameters: [pageParameter, limitParameter],
        responses: {
          '200': {
            description: 'Página de usuarios',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserListResponse' },
              },
            },
          },
          '400': errorResponse,
          '401': errorResponse,
          '403': errorResponse,
          '500': errorResponse,
        },
      },
    },
    '/api/admin/requests': {
      get: {
        tags: ['Admin'],
        summary: 'List all requests',
        description: `${plannedOperation} Requiere rol ADMIN. Incluye todos los estados y no aplica filtros.`,
        operationId: 'listAllRequests',
        security: bearerSecurity,
        parameters: [pageParameter, limitParameter],
        responses: {
          '200': {
            description: 'Página de solicitudes',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RequestListResponse' },
              },
            },
          },
          '400': errorResponse,
          '401': errorResponse,
          '403': errorResponse,
          '500': errorResponse,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    parameters: {
      Page: {
        name: 'page',
        in: 'query',
        required: false,
        description: 'Propuesta: número de página, comenzando en 1.',
        schema: { type: 'integer', minimum: 1, default: 1 },
      },
      Limit: {
        name: 'limit',
        in: 'query',
        required: false,
        description: 'Propuesta: cantidad por página, entre 1 y 100.',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
    },
    responses: {
      ApiError: {
        description: 'Error con mensaje claro en español',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiError' },
          },
        },
      },
    },
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
      ApiError: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'string',
            example: 'Revisá los datos enviados.',
          },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'fullName', 'role'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          fullName: { type: 'string' },
          phone: { type: 'string', nullable: true },
          role: { type: 'string', enum: ['CLIENTE', 'TECNICO'] },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
        },
      },
      AuthResponse: {
        type: 'object',
        required: ['user', 'token'],
        properties: {
          user: { $ref: '#/components/schemas/PublicUser' },
          token: { type: 'string', description: 'JWT Bearer token.' },
        },
      },
      PublicUser: {
        type: 'object',
        required: ['id', 'email', 'fullName', 'phone', 'role', 'isActive', 'createdAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          fullName: { type: 'string' },
          phone: { type: 'string', nullable: true },
          role: { type: 'string', enum: ['CLIENTE', 'TECNICO', 'ADMIN'] },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AdminUser: {
        allOf: [
          { $ref: '#/components/schemas/PublicUser' },
          {
            type: 'object',
            required: ['updatedAt'],
            properties: {
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        ],
      },
      CreateRequest: {
        type: 'object',
        required: ['serviceId', 'title', 'description', 'address'],
        properties: {
          serviceId: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          description: { type: 'string' },
          address: { type: 'string' },
          budget: { type: 'string', nullable: true, example: '15000.00' },
        },
      },
      RejectRequest: {
        type: 'object',
        properties: {
          note: { type: 'string', nullable: true },
        },
      },
      ServiceSummary: {
        type: 'object',
        required: ['id', 'name', 'slug'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          slug: { type: 'string' },
        },
      },
      ServiceRequest: {
        type: 'object',
        required: [
          'id',
          'clientId',
          'technicianId',
          'serviceId',
          'title',
          'description',
          'address',
          'budget',
          'status',
          'createdAt',
          'updatedAt',
          'acceptedAt',
          'startedAt',
          'completedAt',
          'cancelledAt',
          'cancellationReason',
          'service',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          clientId: { type: 'string', format: 'uuid' },
          technicianId: { type: 'string', format: 'uuid', nullable: true },
          serviceId: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          description: { type: 'string' },
          address: { type: 'string' },
          budget: { type: 'string', nullable: true, example: '15000.00' },
          status: {
            type: 'string',
            enum: ['PENDIENTE', 'ACEPTADA', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA'],
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          acceptedAt: { type: 'string', format: 'date-time', nullable: true },
          startedAt: { type: 'string', format: 'date-time', nullable: true },
          completedAt: { type: 'string', format: 'date-time', nullable: true },
          cancelledAt: { type: 'string', format: 'date-time', nullable: true },
          cancellationReason: { type: 'string', nullable: true },
          service: { $ref: '#/components/schemas/ServiceSummary' },
        },
      },
      Pagination: {
        type: 'object',
        required: ['page', 'limit', 'totalItems', 'totalPages'],
        properties: {
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          totalItems: { type: 'integer', minimum: 0 },
          totalPages: { type: 'integer', minimum: 0 },
        },
      },
      RequestListResponse: {
        type: 'object',
        required: ['items', 'pagination'],
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/ServiceRequest' },
          },
          pagination: { $ref: '#/components/schemas/Pagination' },
        },
      },
      UserListResponse: {
        type: 'object',
        required: ['items', 'pagination'],
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/AdminUser' },
          },
          pagination: { $ref: '#/components/schemas/Pagination' },
        },
      },
      RejectResponse: {
        type: 'object',
        required: ['requestId', 'status', 'rejected'],
        properties: {
          requestId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['PENDIENTE'] },
          rejected: { type: 'boolean', enum: [true] },
        },
      },
    },
  },
};
