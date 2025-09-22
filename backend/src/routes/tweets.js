import express from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { getTweetCategories, saveTweetCategories, categorizeTweet, recategorizeSingleTweet } from '../services/categorizationService.js';

const router = express.Router();
const prisma = new PrismaClient();

// ────────────────────────────────
// 🛠️ UTILIDADES Y HELPERS
// ────────────────────────────────

/**
 * Verificar que el tweet pertenece al usuario
 */
async function verifyTweetOwnership(tweetId, userId) {
  const tweet = await prisma.tweet.findFirst({
    where: {
      id: parseInt(tweetId),
      userId
    }
  });

  if (!tweet) {
    throw new AppError('Tweet no encontrado', 404, 'TWEET_NOT_FOUND');
  }

  return tweet;
}

/**
 * Procesar datos JSON de tweets
 */
function processTweetData(tweet) {
  return {
    ...tweet,
    mediaUrls: tweet.mediaUrls ? JSON.parse(tweet.mediaUrls) : [],
    hashtags: tweet.hashtags ? JSON.parse(tweet.hashtags) : [],
    mentions: tweet.mentions ? JSON.parse(tweet.mentions) : []
  };
}

/**
 * GET /api/v1/tweets
 * Obtener tweets del usuario con filtros y paginación
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      search,
      sortBy = 'bookmarkedAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Construir filtros
    const where = {
      userId: req.user.id,
      isArchived: false
    };

    if (category && category !== 'all') {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { content: { contains: search } },
        { authorUsername: { contains: search } },
        { authorName: { contains: search } }
      ];
    }

    // Construir ordenamiento
    const orderBy = {};
    orderBy[sortBy] = sortOrder;

    // Obtener tweets
    const [tweets, total] = await Promise.all([
      prisma.tweet.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          tweetId: true,
          content: true,
          authorUsername: true,
          authorName: true,
          authorId: true,
          createdAtTwitter: true,
          bookmarkedAt: true,
          category: true,
          retweetCount: true,
          likeCount: true,
          replyCount: true,
          mediaUrls: true,
          hashtags: true,
          mentions: true,
          processed: true
        }
      }),
      prisma.tweet.count({ where })
    ]);

    // Procesar resultados con categorías múltiples
    const processedTweets = await Promise.all(
      tweets.map(async tweet => {
        const categories = await getTweetCategories(tweet.id);
        return {
          ...processTweetData(tweet),
          categories: categories
        };
      })
    );

    const totalPages = Math.ceil(total / take);

    res.json({
      tweets: processedTweets,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: total,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/tweets/:id
 * Obtener tweet específico
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tweet = await verifyTweetOwnership(id, req.user.id);
    const processedTweet = processTweetData(tweet);

    res.json({ tweet: processedTweet });

  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/tweets/:id/category
 * Actualizar categoría de un tweet
 */
router.put('/:id/category', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category } = req.body;

    if (!category) {
      throw new AppError('Categoría requerida', 400, 'MISSING_CATEGORY');
    }

    const existingTweet = await verifyTweetOwnership(id, req.user.id);

    // Verificar que la categoría existe para este usuario
    const categoryExists = await prisma.category.findFirst({
      where: {
        name: category,
        userId: req.user.id
      }
    });

    if (!categoryExists) {
      throw new AppError('Categoría no válida', 400, 'INVALID_CATEGORY');
    }

    // Actualizar tweet
    const updatedTweet = await prisma.tweet.update({
      where: { id: parseInt(id) },
      data: { category }
    });

    logger.info('Tweet category updated', {
      userId: req.user.id,
      tweetId: updatedTweet.tweetId,
      oldCategory: existingTweet.category,
      newCategory: category
    });

    res.json({
      success: true,
      tweet: updatedTweet
    });

  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/tweets/:id
 * Archivar (soft delete) un tweet
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await verifyTweetOwnership(id, req.user.id);

    // Archivar en lugar de eliminar
    const archivedTweet = await prisma.tweet.update({
      where: { id: parseInt(id) },
      data: { isArchived: true }
    });

    logger.info('Tweet archived', {
      userId: req.user.id,
      tweetId: archivedTweet.tweetId
    });

    res.json({
      success: true,
      message: 'Tweet archivado exitosamente'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/tweets/categories/stats
 * Obtener estadísticas por categoría
 */
router.get('/categories/stats', async (req, res, next) => {
  try {
    const stats = await prisma.tweet.groupBy({
      by: ['category'],
      where: {
        userId: req.user.id,
        isArchived: false
      },
      _count: {
        id: true
      }
    });

    const formattedStats = stats.map(stat => ({
      category: stat.category || 'Sin categoría',
      count: stat._count.id
    }));

    res.json({ stats: formattedStats });

  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/tweets/:id/categories
 * Actualizar categorías de un tweet específico
 */
router.put('/:id/categories', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { categories } = req.body;

    if (!categories || !Array.isArray(categories)) {
      throw new AppError('Se requiere un array de categorías', 400, 'INVALID_CATEGORIES');
    }

    await verifyTweetOwnership(id, req.user.id);

    // Guardar las categorías
    await saveTweetCategories(parseInt(id), categories, req.user.id);

    // Obtener las categorías actualizadas
    const updatedCategories = await getTweetCategories(parseInt(id));

    logger.info('Categorías de tweet actualizadas:', {
      userId: req.user.id,
      tweetId: id,
      categories: categories.map(cat => cat.category)
    });

    res.json({
      success: true,
      message: 'Categorías actualizadas exitosamente',
      categories: updatedCategories
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/tweets/:id/categorize
 * Recategorizar un tweet específico usando IA
 */
router.post('/:id/categorize', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Usar la nueva función de recategorización individual
    const result = await recategorizeSingleTweet(parseInt(id), req.user.id);

    // Obtener las categorías actualizadas
    const updatedCategories = await getTweetCategories(parseInt(id));

    res.json({
      success: true,
      message: 'Tweet recategorizado exitosamente',
      data: {
        tweetId: result.tweetId,
        oldCategory: result.oldCategory,
        newCategory: result.newCategory,
        confidence: result.confidence,
        allCategories: result.allCategories
      },
      categories: updatedCategories
    });

  } catch (error) {
    next(error);
  }
});

export default router;