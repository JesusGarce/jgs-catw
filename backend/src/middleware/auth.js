import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { logger, logAuth, logError } from '../utils/logger.js';

const prisma = new PrismaClient();

// Middleware de autenticación JWT
export const authMiddleware = async (req, res, next) => {
  try {
    // Obtener token del header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Token de acceso requerido',
        code: 'MISSING_TOKEN' 
      });
    }

    const token = authHeader.substring(7); // Remover "Bearer "

    // Verificar y decodificar token JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Buscar usuario en la base de datos
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        twitterId: true,
        username: true,
        displayName: true,
        isActive: true,
        lastSync: true,
        accessToken: true,
        refreshToken: true
      }
    });

    if (!user) {
      logAuth('USER_NOT_FOUND', { userId: decoded.userId });
      return res.status(401).json({ 
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND' 
      });
    }

    if (!user.isActive) {
      logAuth('USER_INACTIVE', { userId: user.id });
      return res.status(403).json({ 
        error: 'Cuenta desactivada',
        code: 'USER_INACTIVE' 
      });
    }

    // Agregar usuario al request
    req.user = user;
    
    // Log exitoso
    logAuth('AUTH_SUCCESS', { 
      userId: user.id, 
      username: user.username,
      endpoint: req.path 
    });

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logAuth('INVALID_TOKEN', { error: error.message });
      return res.status(401).json({ 
        error: 'Token inválido',
        code: 'INVALID_TOKEN' 
      });
    }

    if (error.name === 'TokenExpiredError') {
      logAuth('EXPIRED_TOKEN', { expiredAt: error.expiredAt });
      return res.status(401).json({ 
        error: 'Token expirado',
        code: 'EXPIRED_TOKEN' 
      });
    }

    logError(error, { 
      middleware: 'auth',
      headers: req.headers,
      path: req.path 
    });

    return res.status(500).json({ 
      error: 'Error de autenticación',
      code: 'AUTH_ERROR' 
    });
  }
};

// Middleware opcional - permite acceso sin autenticación pero agrega user si está autenticado
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continuar sin usuario
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId, isActive: true },
      select: {
        id: true,
        twitterId: true,
        username: true,
        displayName: true,
        lastSync: true
      }
    });

    if (user) {
      req.user = user;
    }

    next();

  } catch (error) {
    // En caso de error, simplemente continuar sin usuario
    next();
  }
};

// Utilidad para generar tokens JWT
export const generateTokens = (userId) => {
  const payload = { userId, type: 'access' };
  
  const accessToken = jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'twitter-archiver',
      audience: 'twitter-archiver-client'
    }
  );

  return { accessToken };
};

// Utilidad para verificar si un token es válido
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Cleanup: cerrar conexión Prisma al terminar
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});