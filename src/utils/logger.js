const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, align } = format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

// Logger for development environment
const devLogger = () => {
  return createLogger({
    level: 'debug',
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.errors({ stack: true }),
      logFormat
    ),
    transports: [new transports.Console()],
  });
};

// Logger for production environment
const prodLogger = () => {
  return createLogger({
    level: 'info',
    format: combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.errors({ stack: true }),
      format.json()
    ),
    defaultMeta: { service: 'uber-rapido-backend' },
    transports: [
      new transports.Console(),
      new transports.File({
        filename: 'logs/error.log',
        level: 'error',
      }),
      new transports.File({ filename: 'logs/combined.log' }),
    ],
  });
};

// Select logger based on environment
let logger = null;
if (process.env.NODE_ENV === 'production') {
  logger = prodLogger();
} else {
  logger = devLogger();
}

// Add stream for morgan logging
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

module.exports = logger;