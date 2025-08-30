import { PrismaClient } from '@prisma/client';
import { logger, logSync, logError } from '../utils/logger.js';
import { syncUserTimeline } from '../services/twitterService.js';

const prisma = new PrismaClient();

/**
 * Sincronizar bookmarks de todos los usuarios activos
 */
export async function syncAllUsers() {
  const startTime = Date.now();
  let totalUsers = 0;
  let successfulSyncs = 0;
  let failedSyncs = 0;

  try {
    // Obtener todos los usuarios activos con token de acceso
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        accessToken: { not: null }
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        lastSync: true
      }
    });

    totalUsers = users.length;
    
    if (totalUsers === 0) {
      logger.info('No hay usuarios activos para sincronizar');
      return { totalUsers: 0, successfulSyncs: 0, failedSyncs: 0 };
    }

    logger.info(`🔄 Iniciando sincronización para ${totalUsers} usuarios`);

    // Procesar usuarios de uno en uno para evitar sobrecargar la API
    for (const user of users) {
      try {
        logger.info(`📥 Sincronizando usuario: ${user.username} (${user.id})`);
        
        const result = await syncUserTimeline(user.id, user.username);
        
        logSync(user.id, 'AUTO_SYNC_SUCCESS', {
          username: user.username,
          totalTweets: result.totalTweets,
          newTweets: result.newTweets,
          duration: result.duration
        });

        successfulSyncs++;
        
        // Pausa entre usuarios para respetar rate limits
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 segundos

      } catch (error) {
        failedSyncs++;
        
        logSync(user.id, 'AUTO_SYNC_ERROR', {
          username: user.username,
          error: error.message
        });

        // Si es un error de rate limit, esperar más tiempo
        if (error.isTwitterError && error.statusCode === 429) {
          logger.warn(`⏰ Rate limit alcanzado para ${user.username}, esperando...`);
          await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000)); // 15 minutos
        } else {
          // Para otros errores, pausa más corta
          await new Promise(resolve => setTimeout(resolve, 5000)); // 5 segundos
        }
      }
    }

    const totalDuration = Date.now() - startTime;
    
    logger.info(`✅ Sincronización automática completada:`, {
      totalUsers,
      successfulSyncs,
      failedSyncs,
      duration: `${Math.round(totalDuration / 1000)}s`,
      successRate: `${Math.round((successfulSyncs / totalUsers) * 100)}%`
    });

    return {
      totalUsers,
      successfulSyncs,
      failedSyncs,
      duration: totalDuration
    };

  } catch (error) {
    logError(error, {
      context: 'sync_all_users',
      totalUsers,
      successfulSyncs,
      failedSyncs
    });

    throw error;
  }
}

/**
 * Sincronizar usuario específico con reintentos
 */
export async function syncUserWithRetry(userId, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`🔄 Intento ${attempt}/${maxRetries} - Sincronizando usuario ${userId}`);
      
      const result = await syncUserTimeline(userId, user.username);
      
      logger.info(`✅ Usuario ${userId} sincronizado exitosamente en intento ${attempt}`);
      return result;

    } catch (error) {
      lastError = error;
      
      logger.warn(`⚠️ Intento ${attempt}/${maxRetries} falló para usuario ${userId}: ${error.message}`);
      
      // Si es el último intento, no esperar
      if (attempt === maxRetries) {
        break;
      }
      
      // Calcular tiempo de espera exponencial
      const waitTime = Math.min(1000 * Math.pow(2, attempt), 30000); // Máximo 30 segundos
      
      logger.info(`⏰ Esperando ${waitTime}ms antes del siguiente intento...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  // Si llegamos aquí, todos los intentos fallaron
  logError(lastError, {
    context: 'sync_user_with_retry',
    userId,
    maxRetries,
    finalAttempt: true
  });
  
  throw lastError;
}

/**
 * Obtener estadísticas de sincronización
 */
export async function getSyncStats(userId = null, days = 7) {
  try {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);

    const where = {
      startedAt: { gte: dateLimit }
    };

    if (userId) {
      where.userId = userId;
    }

    const [logs, summary] = await Promise.all([
      // Logs detallados
      prisma.syncLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: 50
      }),

      // Resumen estadístico
      prisma.syncLog.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
        _avg: { duration: true },
        _sum: { 
          tweetsFound: true,
          tweetsNew: true 
        }
      })
    ]);

    const stats = {
      period: `${days} días`,
      totalSyncs: logs.length,
      summary: summary.map(stat => ({
        status: stat.status,
        count: stat._count.id,
        avgDuration: Math.round(stat._avg.duration || 0),
        totalTweetsFound: stat._sum.tweetsFound || 0,
        totalNewTweets: stat._sum.tweetsNew || 0
      })),
      recentLogs: logs
    };

    return stats;

  } catch (error) {
    logError(error, { context: 'get_sync_stats', userId, days });
    throw error;
  }
}