import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';

const app = createApp();

app.listen(config.port, () => {
  logger.info('Room assignment backend is listening', {
    port: config.port,
    environment: config.env,
  });
});
