import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración de formatos
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    // Agregar metadata si existe
    if (Object.keys(meta).length > 0) {
      msg += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return msg;
  })
);

// Crear directorio de logs si no existe
import fs from 'fs';
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configuración del logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Archivo para todos los logs
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      maxsize: 10000000, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Archivo separado para errores
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10000000, // 10MB
      maxFiles: 3,
      tailable: true
    })
  ]
});

// Agregar consola en desarrollo
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Funciones de utilidad para logging estructurado
export const logTwitterAPI = (action, details) => {
  logger.info('Twitter API Call', {
    service: 'twitter',
    action,
    ...details
  });
};

export const logSync = (userId, action, details) => {
  logger.info('Sync Operation', {
    service: 'sync',
    userId,
    action,
    ...details
  });
};

export const logAuth = (action, details) => {
  logger.info('Auth Operation', {
    service: 'auth',
    action,
    ...details
  });
};

export const logError = (error, context = {}) => {
  logger.error('Application Error', {
    error: error.message,
    stack: error.stack,
    ...context
  });
};

export { logger };