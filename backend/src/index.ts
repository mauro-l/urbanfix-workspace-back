import 'dotenv/config';
import { createApp } from './app.js';

const app = createApp();
const PORT = Number(process.env.PORT ?? 3001);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
