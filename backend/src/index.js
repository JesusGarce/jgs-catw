import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

// Importar configuraciones y servicios
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';

// Importar rutas
import authRoutes from './routes/auth.js';
import tweetRoutes from './routes/tweets.js';
import categoryRoutes from './routes/categories.js';
import userRoutes from './routes/user.js';

// Importar servicios
import { startScheduledJobs } from './jobs/index.js';
import { initializeAI } from './services/categorizationService.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configuración de rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Demasiadas peticiones desde esta IP, intenta de nuevo más tarde.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middlewares de seguridad y logging
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4321',
  credentials: true
}));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Rutas de autenticación (públicas)
app.use('/auth', authRoutes);

// Rutas protegidas
app.use('/api/v1/tweets', authMiddleware, tweetRoutes);
app.use('/api/v1/categories', authMiddleware, categoryRoutes);
app.use('/api/v1/user', authMiddleware, userRoutes);

// Ruta para forzar sincronización manual
app.post('/api/v1/sync', authMiddleware, async (req, res) => {
  try {
    const { syncUserTimeline } = await import('./services/twitterService.js');
const result = await syncUserTimeline(req.user.id, req.user.username);
    res.json(result);
  } catch (error) {
    logger.error('Error en sincronización manual:', error);
    res.status(500).json({ error: 'Error en la sincronización' });
  }
});

// Ruta para estadísticas
app.get('/api/v1/stats', authMiddleware, async (req, res) => {
  try {
    const { getUserStats } = await import('./services/statsService.js');
    const stats = await getUserStats(req.user.id);
    res.json(stats);
  } catch (error) {
    logger.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// Middleware de manejo de errores (debe ir al final)
app.use(errorHandler);

// Inicialización de la aplicación
async function startServer() {
  try {
    // Inicializar modelo de IA si está habilitado
    if (process.env.ENABLE_AUTO_CATEGORIZATION === 'true') {
      logger.info('Inicializando modelo de categorización...');
      await initializeAI();
      logger.info('Modelo de categorización inicializado');
    }

    // Iniciar trabajos programados
    startScheduledJobs();
    logger.info('Trabajos programados iniciados');

    // Iniciar servidor
    app.listen(PORT, () => {
      logger.info(`🚀 Servidor iniciado en puerto ${PORT}`);
      logger.info(`🌍 Entorno: ${process.env.NODE_ENV}`);
      logger.info(`📱 Frontend URL: ${process.env.FRONTEND_URL}`);
    });

  } catch (error) {
    logger.error('Error iniciando servidor:', error);
    process.exit(1);
  }
}

// Manejo de cierre graceful
process.on('SIGTERM', () => {
  logger.info('SIGTERM recibido. Cerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT recibido. Cerrando servidor...');
  process.exit(0);
});

startServer();