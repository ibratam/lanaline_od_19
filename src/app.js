import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/logger.js';
import { errorHandler } from './api/middleware/errorHandler.js';
import { requestLogger } from './api/middleware/requestLogger.js';
import createConfigRouter from './api/routes/config.js';
import createSyncRouter from './api/routes/sync.js';
import createScheduleRouter from './api/routes/schedule.js';
import createHistoryRouter from './api/routes/history.js';
import ConfigManager from './services/ConfigManager.js';
import ScheduleManager from './services/ScheduleManager.js';
import HistoryLogger from './services/HistoryLogger.js';
import DataPreserver from './services/DataPreserver.js';
import NotificationService from './services/NotificationService.js';

// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create and configure Express app
 */
export function createApp(db) {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(requestLogger);

  // Serve static files (frontend)
  app.use(express.static(path.join(__dirname, 'public')));

  // Initialize services
  const services = {
    configManager: new ConfigManager(db)
  };

  services.historyLogger = new HistoryLogger(db);
  services.dataPreserver = new DataPreserver();
  services.notificationService = new NotificationService();
  services.scheduleManager = new ScheduleManager(db, services);
  services.scheduleManager.startScheduler();

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });

  // API Routes
  app.use('/api/config', createConfigRouter(db, services));
  app.use('/api/sync', createSyncRouter(db, services));
  app.use('/api/schedule', createScheduleRouter(db, services));
  app.use('/api/history', createHistoryRouter(db, services));

  // TODO: Add more API routes if needed

  // Error handling middleware (must be last)
  app.use(errorHandler);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not found',
      path: req.path,
      code: 'NOT_FOUND'
    });
  });

  return app;
}

// Start server if running directly
if (process.env.NODE_ENV !== 'test') {
  const { initializeDatabase } = await import('./db/init.js');

  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || 'localhost';

  try {
    // Initialize database
    const db = await initializeDatabase();

    // Create and start app
    const app = createApp(db);
    const server = app.listen(PORT, HOST, () => {
      logger.info(`Odoo Sync Middleware running at http://${HOST}:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'production'}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      server.close(() => {
        logger.info('HTTP server closed');
        if (db) db.close();
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

export default createApp;
