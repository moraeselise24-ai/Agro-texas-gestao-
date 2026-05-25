/**
 * local server entry file, for local development
 */
import app from './app.js';
import { startCollectSchedule } from './scheduler/collectSchedule.js';

/**
 * start server with port
 */
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`Server ready on http://${HOST}:${PORT}`);
  startCollectSchedule();
});

server.on('error', (err: NodeJS.ErrnoException) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
