import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

app.listen(config.port, config.host, () => {
  const mode = config.isProd ? 'production' : 'développement';
  console.log(`▶ Portfolio API (${mode}) sur http://localhost:${config.port}`);
});
