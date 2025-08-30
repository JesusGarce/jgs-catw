import express from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/v1/user/profile
 * Obtener perfil del usuario
 */
router.get('/profile', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        twitterId: true,
        username: true,
        displayName: true,
        lastSync: true,
        createdAt: true,
        isActive: true,
        _count: {
          select: {
            tweets: {
              where: { isArchived: false }
            },
            categories: true
          }
        }
      }
    });

    if (!user) {
      throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
    }

    res.json({ user });

  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/user/profile
 * Actualizar perfil del usuario
 */
router.put('/profile', async (req, res, next) => {
  try {
    const { displayName } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { displayName },
      select: {
        id: true,
        twitterId: true,
        username: true,
        displayName: true,
        lastSync: true,
        createdAt: true
      }
    });

    logger.info('User profile updated', {
      userId: req.user.id,
      username: req.user.username
    });

    res.json({
      success: true,
      user: updatedUser
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/user/stats
 * Obtener estadísticas del usuario
 */
router.get('/stats', async (req, res, next) => {
  try {
    // Estadísticas básicas
    const [
      totalTweets,
      totalCategories,
      tweetsThisWeek,
      recentSyncs
    ] = await Promise.all([
      // Total de tweets activos
      prisma.tweet.count({
        where: {
          userId: req.user.id,
          isArchived: false
        }
      }),

      // Total de categorías
      prisma.category.count({
        where: { userId: req.user.id }
      }),

      // Tweets de esta semana
      prisma.tweet.count({
        where: {
          userId: req.user.id,
          isArchived: false,
          bookmarkedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Última semana
          }
        }
      }),

      // Últimas 5 sincronizaciones
      prisma.syncLog.findMany({
        where: { userId: req.user.id },
        orderBy: { startedAt: 'desc' },
        take: 5
      })
    ]);

    // Tweets por categoría
    const tweetsByCategory = await prisma.tweet.groupBy({
      by: ['category'],
      where: {
        userId: req.user.id,
        isArchived: false
      },
      _count: {
        id: true
      }
    });

    // Tweets por mes (últimos 6 meses)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const tweetsByMonth = await prisma.$queryRaw`
      SELECT 
        DATE_FORMAT(bookmarked_at, '%Y-%m') as month,
        COUNT(*) as count
      FROM tweets 
      WHERE user_id = ${req.user.id} 
        AND is_archived = false
        AND bookmarked_at >= ${sixMonthsAgo}
      GROUP BY DATE_FORMAT(bookmarked_at, '%Y-%m')
      ORDER BY month ASC
    `;

    const stats = {
      overview: {
        totalTweets,
        totalCategories,
        tweetsThisWeek,
        lastSync: req.user.lastSync
      },
      categories: tweetsByCategory.map(item => ({
        category: item.category || 'Sin categoría',
        count: item._count.id
      })),
      timeline: tweetsByMonth,
      recentSyncs
    };

    res.json({ stats });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/user/export
 * Exportar datos del usuario (futuro)
 */
router.post('/export', async (req, res, next) => {
  try {
    // Por ahora solo devolver información básica
    // En el futuro implementar exportación completa
    
    res.json({
      message: 'Función de exportación en desarrollo',
      available: false
    });

  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/user/account
 * Eliminar cuenta del usuario
 */
router.delete('/account', async (req, res, next) => {
  try {
    const { confirmation } = req.body;

    if (confirmation !== 'DELETE_MY_ACCOUNT') {
      throw new AppError(
        'Confirmación requerida. Envía "DELETE_MY_ACCOUNT" en el campo confirmation',
        400,
        'MISSING_CONFIRMATION'
      );
    }

    // Eliminar en cascada (Prisma se encarga gracias a onDelete: Cascade)
    await prisma.user.delete({
      where: { id: req.user.id }
    });

    logger.info('User account deleted', {
      userId: req.user.id,
      username: req.user.username
    });

    res.json({
      success: true,
      message: 'Cuenta eliminada exitosamente'
    });

  } catch (error) {
    next(error);
  }
});

export default router;