import logger from '../../utils/logger.js';

/**
 * Request/Response logging middleware
 */
export function requestLogger(req, res, next) {
  const startTime = Date.now();
  const method = req.method;
  const path = req.path;

  // Log incoming request
  logger.info(`[${method}] ${path}`, {
    method,
    path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    ip: req.ip || req.connection.remoteAddress
  });

  // Capture response
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;

    logger.info(`[${method}] ${path} - ${res.statusCode}`, {
      method,
      path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });

    return originalJson.call(this, data);
  };

  next();
}

export default requestLogger;
