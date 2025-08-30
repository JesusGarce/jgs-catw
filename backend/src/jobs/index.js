import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { syncAllUsers } from './syncBookmarks.js';

export function startScheduledJobs() {
  logger.info('📅 Iniciando trabajos programados...');

  // Sincronización diaria de bookmarks - 9:00 AM todos los días
  const syncSchedule = process.env.SYNC_SCHEDULE_CRON || '0 9 * * *';
  
  cron.schedule(syncSchedule, async () => {
    logger.info('🔄 Iniciando sincronización programada de todos los usuarios');
    
    try {
      await syncAllUsers();
      logger.info('✅ Sincronización programada completada exitosamente');
    } catch (error) {
      logger.error('❌ Error en sincronización programada:', error);
    }
  }, {
    scheduled: true,
    timezone: "Europe/Madrid" // Ajustar según tu zona horaria
  });

  // Job de limpieza semanal - Domingos a las 2:00 AM
  cron.schedule('0 2 * * 0', async () => {
    logger.info('🧹 Iniciando limpieza semanal');
    
    try {
      await cleanupOldLogs();
      logger.info('✅ Limpieza semanal completada');
    } catch (error) {
      logger.error('❌ Error en limpieza semanal:', error);
    }
  }, {
    scheduled: true,
    timezone: "Europe/Madrid"
  });

  // Job de mantenimiento mensual - Primer día del mes a las 1:00 AM
  cron.schedule('0 1 1 * *', async () => {
    logger.info('🔧 Iniciando mantenimiento mensual');
    
    try {
      await monthlyMaintenance();
      logger.info('✅ Mantenimiento mensual completado');
    } catch (error) {
      logger.error('❌ Error en mantenimiento mensual:', error);
    }
  }, {
    scheduled: true,
    timezone: "Europe/Madrid"
  });

  logger.info(`📅 Trabajos programados configurados:`);
  logger.info(`   • Sincronización diaria: ${syncSchedule}`);
  logger.info(`   • Limpieza semanal: Domingos 2:00 AM`);
  logger.info(`   • Mantenimiento mensual: 1er día del mes 1:00 AM`);
}

async function cleanupOldLogs() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  
  try {
    // Eliminar logs de sincronización más antiguos que 30 días
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const deletedLogs = await prisma.syncLog.deleteMany({
      where: {
        startedAt: {
          lt: thirtyDaysAgo
        }
      }
    });
    
    logger.info(`🗑️ Eliminados ${deletedLogs.count} logs antiguos de sincronización`);
    
  } catch (error) {
    logger.error('Error en limpieza de logs:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function monthlyMaintenance() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  
  try {
    // Actualizar contadores de tweets en categorías
    const categories = await prisma.category.findMany();
    
    for (const category of categories) {
      const tweetCount = await prisma.tweet.count({
        where: {
          userId: category.userId,
          category: category.name,
          isArchived: false
        }
      });
      
      await prisma.category.update({
        where: { id: category.id },
        data: { tweetCount }
      });
    }
    
    logger.info(`🔢 Actualizados contadores de ${categories.length} categorías`);
    
    // Identificar usuarios inactivos (sin sync en 30 días)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const inactiveUsers = await prisma.user.count({
      where: {
        OR: [
          { lastSync: { lt: thirtyDaysAgo } },
          { lastSync: null }
        ],
        isActive: true
      }
    });
    
    logger.info(`⚠️ Usuarios inactivos detectados: ${inactiveUsers}`);
    
  } catch (error) {
    logger.error('Error en mantenimiento mensual:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}