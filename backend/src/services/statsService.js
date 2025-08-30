import { PrismaClient } from '@prisma/client';
import { logger, logError } from '../utils/logger.js';

const prisma = new PrismaClient();

/**
 * Obtener estadísticas completas del usuario
 */
export async function getUserStats(userId) {
  try {
    const [
      basicStats,
      categoryStats,
      timelineStats,
      syncStats
    ] = await Promise.all([
      getBasicUserStats(userId),
      getCategoryStats(userId),
      getTimelineStats(userId),
      getRecentSyncStats(userId)
    ]);

    return {
      basic: basicStats,
      categories: categoryStats,
      timeline: timelineStats,
      syncs: syncStats,
      generatedAt: new Date().toISOString()
    };

  } catch (error) {
    logError(error, { context: 'get_user_stats', userId });
    throw error;
  }
}

/**
 * Estadísticas básicas del usuario
 */
async function getBasicUserStats(userId) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalTweets,
    totalCategories,
    tweetsThisWeek,
    tweetsThisMonth,
    processedTweets,
    user
  ] = await Promise.all([
    prisma.tweet.count({
      where: { userId, isArchived: false }
    }),
    prisma.category.count({
      where: { userId }
    }),
    prisma.tweet.count({
      where: {
        userId,
        isArchived: false,
        bookmarkedAt: { gte: weekAgo }
      }
    }),
    prisma.tweet.count({
      where: {
        userId,
        isArchived: false,
        bookmarkedAt: { gte: monthAgo }
      }
    }),
    prisma.tweet.count({
      where: { userId, processed: true, isArchived: false }
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { lastSync: true, createdAt: true }
    })
  ]);

  return {
    totalTweets,
    totalCategories,
    tweetsThisWeek,
    tweetsThisMonth,
    processedTweets,
    processingRate: totalTweets > 0 ? Math.round((processedTweets / totalTweets) * 100) : 0,
    lastSync: user?.lastSync,
    memberSince: user?.createdAt,
    avgTweetsPerDay: totalTweets > 0 ? Math.round(totalTweets / Math.max(1, Math.floor((now - user.createdAt) / (1000 * 60 * 60 * 24)))) : 0
  };
}

/**
 * Estadísticas por categorías
 */
async function getCategoryStats(userId) {
  const categoryData = await prisma.tweet.groupBy({
    by: ['category'],
    where: {
      userId,
      isArchived: false
    },
    _count: { id: true },
    _avg: {
      likeCount: true,
      retweetCount: true,
      replyCount: true
    }
  });

  // Obtener información adicional de las categorías
  const categories = await prisma.category.findMany({
    where: { userId },
    select: { name: true, color: true, description: true }
  });

  const categoryMap = {};
  categories.forEach(cat => {
    categoryMap[cat.name] = { color: cat.color, description: cat.description };
  });

  const stats = categoryData.map(item => ({
    name: item.category || 'Sin categoría',
    count: item._count.id,
    avgLikes: Math.round(item._avg.likeCount || 0),
    avgRetweets: Math.round(item._avg.retweetCount || 0),
    avgReplies: Math.round(item._avg.replyCount || 0),
    color: categoryMap[item.category]?.color || '#6B7280',
    description: categoryMap[item.category]?.description || null
  }));

  // Ordenar por cantidad de tweets
  stats.sort((a, b) => b.count - a.count);

  return {
    categories: stats,
    mostPopular: stats[0]?.name || null,
    leastPopular: stats[stats.length - 1]?.name || null,
    totalCategories: stats.length
  };
}

/**
 * Estadísticas temporales (timeline)
 */
async function getTimelineStats(userId) {
  // Tweets por mes (últimos 12 meses)
  const tweetsPerMonth = await prisma.$queryRaw`
    SELECT 
      DATE_FORMAT(bookmarked_at, '%Y-%m') as month,
      COUNT(*) as count,
      AVG(like_count) as avgLikes,
      AVG(retweet_count) as avgRetweets
    FROM tweets 
    WHERE user_id = ${userId} 
      AND is_archived = false
      AND bookmarked_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
    GROUP BY DATE_FORMAT(bookmarked_at, '%Y-%m')
    ORDER BY month ASC
  `;

  // Tweets por día de la semana
  const tweetsByDayOfWeek = await prisma.$queryRaw`
    SELECT 
      DAYNAME(bookmarked_at) as dayName,
      DAYOFWEEK(bookmarked_at) as dayNumber,
      COUNT(*) as count
    FROM tweets 
    WHERE user_id = ${userId} 
      AND is_archived = false
      AND bookmarked_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
    GROUP BY DAYOFWEEK(bookmarked_at), DAYNAME(bookmarked_at)
    ORDER BY dayNumber ASC
  `;

  // Tweets por hora del día
  const tweetsByHour = await prisma.$queryRaw`
    SELECT 
      HOUR(bookmarked_at) as hour,
      COUNT(*) as count
    FROM tweets 
    WHERE user_id = ${userId} 
      AND is_archived = false
      AND bookmarked_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)
    GROUP BY HOUR(bookmarked_at)
    ORDER BY hour ASC
  `;

  return {
    monthly: tweetsPerMonth.map(row => ({
      month: row.month,
      count: Number(row.count),
      avgLikes: Math.round(Number(row.avgLikes) || 0),
      avgRetweets: Math.round(Number(row.avgRetweets) || 0)
    })),
    byDayOfWeek: tweetsByDayOfWeek.map(row => ({
      day: row.dayName,
      dayNumber: Number(row.dayNumber),
      count: Number(row.count)
    })),
    byHour: tweetsByHour.map(row => ({
      hour: Number(row.hour),
      count: Number(row.count)
    }))
  };
}

/**
 * Estadísticas de sincronización recientes
 */
async function getRecentSyncStats(userId) {
  const recentSyncs = await prisma.syncLog.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: 10,
    select: {
      status: true,
      tweetsFound: true,
      tweetsNew: true,
      duration: true,
      startedAt: true,
      completedAt: true,
      error: true
    }
  });

  // Estadísticas de los últimos 30 días
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const monthlyStats = await prisma.syncLog.aggregate({
    where: {
      userId,
      startedAt: { gte: thirtyDaysAgo }
    },
    _count: { id: true },
    _avg: { duration: true },
    _sum: {
      tweetsFound: true,
      tweetsNew: true
    }
  });

  const successfulSyncs = await prisma.syncLog.count({
    where: {
      userId,
      status: 'success',
      startedAt: { gte: thirtyDaysAgo }
    }
  });

  const successRate = monthlyStats._count.id > 0 
    ? Math.round((successfulSyncs / monthlyStats._count.id) * 100)
    : 0;

  return {
    recent: recentSyncs,
    last30Days: {
      totalSyncs: monthlyStats._count.id || 0,
      successfulSyncs,
      successRate,
      avgDuration: Math.round(monthlyStats._avg.duration || 0),
      totalTweetsFound: monthlyStats._sum.tweetsFound || 0,
      totalNewTweets: monthlyStats._sum.tweetsNew || 0
    }
  };
}

/**
 * Obtener tweets más populares del usuario
 */
export async function getPopularTweets(userId, limit = 10) {
  try {
    const popularTweets = await prisma.tweet.findMany({
      where: {
        userId,
        isArchived: false
      },
      orderBy: {
        likeCount: 'desc'
      },
      take: limit,
      select: {
        id: true,
        tweetId: true,
        content: true,
        authorUsername: true,
        authorName: true,
        category: true,
        likeCount: true,
        retweetCount: true,
        replyCount: true,
        createdAtTwitter: true,
        bookmarkedAt: true
      }
    });

    return popularTweets;

  } catch (error) {
    logError(error, { context: 'get_popular_tweets', userId });
    throw error;
  }
}

/**
 * Obtener resumen de actividad semanal
 */
export async function getWeeklyActivity(userId) {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const activity = await prisma.$queryRaw`
      SELECT 
        DATE(bookmarked_at) as date,
        COUNT(*) as tweetsCount,
        COUNT(DISTINCT category) as categoriesUsed,
        AVG(like_count) as avgLikes
      FROM tweets 
      WHERE user_id = ${userId} 
        AND is_archived = false
        AND bookmarked_at >= ${weekAgo}
      GROUP BY DATE(bookmarked_at)
      ORDER BY date ASC
    `;

    return activity.map(row => ({
      date: row.date,
      tweetsCount: Number(row.tweetsCount),
      categoriesUsed: Number(row.categoriesUsed),
      avgLikes: Math.round(Number(row.avgLikes) || 0)
    }));

  } catch (error) {
    logError(error, { context: 'get_weekly_activity', userId });
    throw error;
  }
}

/**
 * Comparar estadísticas con período anterior
 */
export async function getGrowthStats(userId) {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [currentPeriod, previousPeriod] = await Promise.all([
      prisma.tweet.count({
        where: {
          userId,
          isArchived: false,
          bookmarkedAt: { gte: thirtyDaysAgo }
        }
      }),
      prisma.tweet.count({
        where: {
          userId,
          isArchived: false,
          bookmarkedAt: {
            gte: sixtyDaysAgo,
            lt: thirtyDaysAgo
          }
        }
      })
    ]);

    const growth = previousPeriod > 0 
      ? Math.round(((currentPeriod - previousPeriod) / previousPeriod) * 100)
      : currentPeriod > 0 ? 100 : 0;

    return {
      current: currentPeriod,
      previous: previousPeriod,
      growth,
      trend: growth > 0 ? 'up' : growth < 0 ? 'down' : 'stable'
    };

  } catch (error) {
    logError(error, { context: 'get_growth_stats', userId });
    throw error;
  }
}