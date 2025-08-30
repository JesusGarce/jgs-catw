import { logger, logError } from '../utils/logger.js';

// Middleware principal de manejo de errores
export const errorHandler = (err, req, res, next) => {
  // Construir contexto del error
  const context = {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || null,
    body: req.method === 'POST' || req.method === 'PUT' ? req.body : undefined,
    params: req.params,
    query: req.query
  };

  // Diferentes tipos de errores
  let statusCode = 500;
  let message = 'Error interno del servidor';
  let code = 'INTERNAL_ERROR';

  // Errores de validación
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Error de validación';
    code = 'VALIDATION_ERROR';
    
    logError(err, { 
      ...context, 
      type: 'validation',
      validationErrors: err.details || err.errors
    });
  }
  
  // Errores de Prisma
  else if (err.name === 'PrismaClientKnownRequestError') {
    statusCode = 400;
    
    switch (err.code) {
      case 'P2002':
        message = 'Ya existe un registro con estos datos';
        code = 'DUPLICATE_ENTRY';
        break;
      case 'P2025':
        message = 'Registro no encontrado';
        code = 'NOT_FOUND';
        statusCode = 404;
        break;
      case 'P2003':
        message = 'Violación de restricción de clave foránea';
        code = 'FOREIGN_KEY_CONSTRAINT';
        break;
      default:
        message = 'Error de base de datos';
        code = 'DATABASE_ERROR';
    }
    
    logError(err, { 
      ...context, 
      type: 'prisma',
      prismaCode: err.code,
      target: err.meta?.target
    });
  }
  
  // Errores de Twitter API
  else if (err.isTwitterError) {
    statusCode = err.statusCode || 502;
    message = err.message || 'Error de Twitter API';
    code = 'TWITTER_API_ERROR';
    
    logError(err, { 
      ...context, 
      type: 'twitter_api',
      twitterCode: err.code,
      rateLimit: err.rateLimit
    });
  }
  
  // Errores de autenticación JWT
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Token de autenticación inválido';
    code = 'INVALID_TOKEN';
    
    logError(err, { ...context, type: 'jwt' });
  }
  
  // Errores de rate limiting
  else if (err.name === 'TooManyRequests') {
    statusCode = 429;
    message = 'Demasiadas peticiones, intenta más tarde';
    code = 'RATE_LIMIT_EXCEEDED';
    
    logError(err, { 
      ...context, 
      type: 'rate_limit',
      limit: err.limit,
      windowMs: err.windowMs
    });
  }
  
  // Error personalizado de la aplicación
  else if (err.isAppError) {
    statusCode = err.statusCode || 400;
    message = err.message;
    code = err.code || 'APP_ERROR';
    
    logError(err, { ...context, type: 'application' });
  }
  
  // Errores no controlados
  else {
    logError(err, { 
      ...context, 
      type: 'unhandled',
      stack: err.stack
    });
  }

  // Respuesta al cliente
  const response = {
    error: message,
    code,
    timestamp: new Date().toISOString()
  };

  // En desarrollo, incluir más detalles
  if (process.env.NODE_ENV === 'development') {
    response.details = {
      stack: err.stack,
      originalError: err.message
    };
  }

  res.status(statusCode).json(response);
};

// Manejador para rutas no encontradas (404)
export const notFoundHandler = (req, res) => {
  logger.warn('Ruta no encontrada', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    error: 'Ruta no encontrada',
    code: 'NOT_FOUND',
    path: req.url,
    timestamp: new Date().toISOString()
  });
};

// Función para crear errores personalizados de la aplicación
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isAppError = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Función para crear errores de Twitter API
export class TwitterAPIError extends Error {
  constructor(message, statusCode = 502, code = null, rateLimit = null) {
    super(message);
    this.name = 'TwitterAPIError';
    this.statusCode = statusCode;
    this.code = code;
    this.rateLimit = rateLimit;
    this.isTwitterError = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Manejadores de procesos no controlados
process.on('uncaughtException', (err) => {
  logger.error('Excepción no controlada', {
    error: err.message,
    stack: err.stack,
    type: 'uncaughtException'
  });
  
  // Dar tiempo para que se escriban los logs antes de salir
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promesa rechazada no controlada', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise.toString(),
    type: 'unhandledRejection'
  });
});

// Middleware de validación usando Zod (opcional)
export const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      const validatedData = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      });
      
      // Reemplazar con datos validados
      req.body = validatedData.body;
      req.query = validatedData.query;
      req.params = validatedData.params;
      
      next();
    } catch (error) {
      next(new AppError('Datos de entrada inválidos', 400, 'VALIDATION_ERROR'));
    }
  };
};