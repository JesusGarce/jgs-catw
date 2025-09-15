import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';

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
import { categorizeTweet, saveTweetCategories } from './services/categorizationService.js';
import { initializeAI } from './services/categorizationService.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const prisma = new PrismaClient();

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
  origin: [
    'http://localhost:4321',
    'http://127.0.0.1:4321',
    'http://192.168.31.157:4321',
    process.env.FRONTEND_URL
  ].filter(Boolean),
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
    const { syncUserBookmarks } = await import('./services/twitterService.js');
    const result = await syncUserBookmarks(req.user.id);
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

// Ruta para historial de sincronización
app.get('/api/v1/sync/history', authMiddleware, async (req, res) => {
  try {
    // Por ahora devolver un array vacío hasta implementar el historial
    res.json({ 
      history: [],
      message: 'Historial de sincronización en desarrollo'
    });
  } catch (error) {
    logger.error('Error obteniendo historial de sincronización:', error);
    res.status(500).json({ error: 'Error obteniendo historial de sincronización' });
  }
});

// Ruta para verificar estado de autenticación (para la extensión)
app.get('/api/v1/auth/status', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        twitterId: true,
        username: true,
        displayName: true,
        lastSync: true,
        isActive: true
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ 
        authenticated: false, 
        message: 'Usuario no encontrado o inactivo' 
      });
    }

    res.json({
      authenticated: true,
      user: {
        id: user.id,
        twitterId: user.twitterId,
        username: user.username,
        displayName: user.displayName,
        lastSync: user.lastSync
      }
    });

  } catch (error) {
    logger.error('Error verificando estado de autenticación:', error);
    res.status(500).json({ 
      authenticated: false, 
      error: 'Error verificando autenticación' 
    });
  }
});

// Ruta para recibir tweets de la extensión de Chrome
app.post('/api/v1/tweets/extension', authMiddleware, async (req, res) => {
  try {
    const { tweets } = req.body;
    
    if (!tweets || !Array.isArray(tweets)) {
      return res.status(400).json({ error: 'Se requiere un array de tweets' });
    }

    const userId = req.user.id;
    let processedCount = 0;
    let newTweetsCount = 0;

    // Procesar cada tweet de la extensión
    for (const tweetData of tweets) {
      try {
        // Extraer información del tweet
        const tweetUrl = tweetData.tweet_url;
        const tweetId = tweetUrl ? tweetUrl.split('/status/')[1]?.split('?')[0] : null;
        
        if (!tweetId) {
          logger.warn('Tweet sin ID válido:', tweetData);
          continue;
        }

        // Extraer hashtags y menciones del contenido
        const content = tweetData.tweet_content || '';
        const hashtags = content.match(/#[\w\u00c0-\u024f\u1e00-\u1eff]+/g) || [];
        const mentions = content.match(/@[\w\u00c0-\u024f\u1e00-\u1eff]+/g) || [];

        // Verificar si el tweet ya existe
        const existingTweet = await prisma.tweet.findUnique({
          where: { tweetId }
        });

        if (existingTweet) {
          // El tweet ya existe, no hacer nada
          logger.info('Tweet ya existe, omitiendo:', tweetId);
          continue;
        }

        // Categorizar el tweet automáticamente
        let category = 'General';
        let categories = [];
        const tweetContent = tweetData.tweet_content || '';
        
        if (tweetContent) {
          try {
            const categorizationResult = await categorizeTweet(tweetContent, userId);
            categories = categorizationResult.categories;
            category = categories.find(cat => cat.isPrimary)?.category || categories[0]?.category || 'General';
            logger.debug(`Tweet de extensión categorizado: ${categories.map(cat => cat.category).join(', ')}`);
          } catch (error) {
            logger.warn('Error en categorización automática de extensión:', error.message);
            categories = [{ category: 'General', confidence: 0.3, isPrimary: true }];
          }
        } else {
          categories = [{ category: 'General', confidence: 0.3, isPrimary: true }];
        }

        // Crear nuevo tweet en la base de datos
        const tweet = await prisma.tweet.create({
          data: {
            tweetId,
            content: tweetContent,
            authorId: tweetData.user_handle || 'unknown',
            authorUsername: tweetData.user_handle || 'unknown',
            authorName: tweetData.user_name || 'Unknown User',
            createdAtTwitter: new Date(), // No disponible en scraping
            bookmarkedAt: new Date(),
            retweetCount: 0,
            likeCount: 0,
            replyCount: 0,
            mediaUrls: tweetData.media_url && tweetData.media_url !== 'N/A' ? 
              JSON.stringify([tweetData.media_url]) : null,
            hashtags: hashtags.length > 0 ? JSON.stringify(hashtags) : null,
            mentions: mentions.length > 0 ? JSON.stringify(mentions) : null,
            userId,
            category,
            //source: 'extension' // Marcar como proveniente de la extensión
          }
        });

        // Guardar categorías múltiples
        if (categories.length > 0) {
          try {
            await saveTweetCategories(tweet.id, categories, userId);
          } catch (error) {
            logger.warn('Error guardando categorías múltiples de extensión:', error.message);
          }
        }

        processedCount++;
        newTweetsCount++;

      } catch (error) {
        logger.error('Error procesando tweet de extensión:', error);
        continue;
      }
    }

    // Actualizar última sincronización del usuario
    await prisma.user.update({
      where: { id: userId },
      data: { lastSync: new Date() }
    });

    logger.info('Tweets de extensión procesados:', {
      userId,
      totalReceived: tweets.length,
      processed: processedCount,
      newTweets: newTweetsCount
    });

    res.json({
      success: true,
      message: 'Tweets procesados exitosamente',
      totalReceived: tweets.length,
      processed: processedCount,
      newTweets: newTweetsCount
    });

  } catch (error) {
    logger.error('Error procesando tweets de extensión:', error);
    res.status(500).json({ error: 'Error procesando tweets de la extensión' });
  }
});

// Middleware de manejo de errores (debe ir al final)
app.use(errorHandler);

// Inicialización de la aplicación
async function startServer() {
  try {
    // Inicializar modelo de IA si está habilitado
    // Iniciar trabajos programados
    startScheduledJobs();
    logger.info('Trabajos programados iniciados');

    // Inicializar modelo de IA para categorización
    if (process.env.ENABLE_AUTO_CATEGORIZATION === 'true') {
      logger.info('Inicializando modelo de IA...');
      initializeAI().catch(error => {
        logger.warn('Error inicializando IA:', error.message);
      });
    }

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