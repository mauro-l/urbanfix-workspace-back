import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { openapi } from './openapi.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Raw OpenAPI document, consumable by any client or code generator
app.get('/openapi.json', (_req, res) => {
  res.json(openapi);
});

// Interactive API documentation
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openapi, { customSiteTitle: 'UrbanFix API' }),
);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
