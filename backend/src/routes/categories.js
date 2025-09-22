import express from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { 
  createAutoCategories, 
  recategorizeAllTweets, 
  getSuggestedCategories,
  initializeAI,
  categorizeUncategorizedTweets
} from '../services/categorizationService.js';

const router = express.Router();
const prisma = new PrismaClient();

// ────────────────────────────────
// 🛠️ UTILIDADES Y HELPERS
// ────────────────────────────────

/**
 * Verificar que la categoría pertenece al usuario
 */
async function verifyCategoryOwnership(categoryId, userId) {
  const category = await prisma.category.findFirst({
    where: {
      id: parseInt(categoryId),
      userId
    }
  });

  if (!category) {
    throw new AppError('Categoría no encontrada', 404, 'CATEGORY_NOT_FOUND');
  }

  return category;
}

/**
 * Obtener conteo de tweets por categoría
 */
async function getCategoryTweetCount(categoryName, userId) {
  return await prisma.tweet.count({
    where: {
      userId,
      category: categoryName,
      isArchived: false
    }
  });
}

/**
 * GET /api/v1/categories
 * Obtener todas las categorías del usuario
 */
router.get('/', async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { userId: req.user.id },
      orderBy: { sortOrder: 'asc' }
    });

    // Obtener conteo de tweets por categoría
    const categoriesWithCount = await Promise.all(
      categories.map(async (category) => {
        const tweetCount = await getCategoryTweetCount(category.name, req.user.id);
        return {
          ...category,
          tweetCount
        };
      })
    );

    res.json({ categories: categoriesWithCount });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/categories
 * Crear nueva categoría
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, description, color } = req.body;

    if (!name) {
      throw new AppError('Nombre de categoría requerido', 400, 'MISSING_NAME');
    }

    // Verificar que no existe una categoría con el mismo nombre
    const existingCategory = await prisma.category.findFirst({
      where: {
        userId: req.user.id,
        name: name.trim()
      }
    });

    if (existingCategory) {
      throw new AppError('Ya existe una categoría con ese nombre', 400, 'CATEGORY_EXISTS');
    }

    // Obtener el próximo sortOrder
    const lastCategory = await prisma.category.findFirst({
      where: { userId: req.user.id },
      orderBy: { sortOrder: 'desc' }
    });

    const sortOrder = (lastCategory?.sortOrder || 0) + 1;

    // Crear la categoría
    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        color: color || '#6B7280', // Color por defecto (gris)
        userId: req.user.id,
        sortOrder,
        isDefault: false
      }
    });

    logger.info('Category created', {
      userId: req.user.id,
      categoryId: category.id,
      categoryName: category.name
    });

    res.status(201).json({
      success: true,
      category: {
        ...category,
        tweetCount: 0
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/categories/:id
 * Actualizar categoría existente
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, color, sortOrder } = req.body;

    const existingCategory = await verifyCategoryOwnership(id, req.user.id);

    // Si se está cambiando el nombre, verificar que no exista otra con el mismo nombre
    if (name && name.trim() !== existingCategory.name) {
      const duplicateCategory = await prisma.category.findFirst({
        where: {
          userId: req.user.id,
          name: name.trim(),
          id: { not: parseInt(id) }
        }
      });

      if (duplicateCategory) {
        throw new AppError('Ya existe una categoría con ese nombre', 400, 'CATEGORY_EXISTS');
      }
    }

    // Preparar datos para actualizar
    const updateData = {};
    if (name) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (color) updateData.color = color;
    if (sortOrder !== undefined) updateData.sortOrder = parseInt(sortOrder);

    // Actualizar categoría
    const updatedCategory = await prisma.category.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    // Si se cambió el nombre, actualizar tweets que usan esta categoría
    if (name && name.trim() !== existingCategory.name) {
      await prisma.tweet.updateMany({
        where: {
          userId: req.user.id,
          category: existingCategory.name
        },
        data: {
          category: name.trim()
        }
      });

      logger.info('Category renamed, tweets updated', {
        userId: req.user.id,
        categoryId: updatedCategory.id,
        oldName: existingCategory.name,
        newName: name.trim()
      });
    }

    // Obtener conteo actualizado de tweets
    const tweetCount = await getCategoryTweetCount(updatedCategory.name, req.user.id);

    logger.info('Category updated', {
      userId: req.user.id,
      categoryId: updatedCategory.id,
      categoryName: updatedCategory.name
    });

    res.json({
      success: true,
      category: {
        ...updatedCategory,
        tweetCount
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/categories/:id
 * Eliminar categoría (solo si no tiene tweets)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const category = await verifyCategoryOwnership(id, req.user.id);

    // No permitir eliminar categoría por defecto
    if (category.isDefault) {
      throw new AppError('No se puede eliminar la categoría por defecto', 400, 'CANNOT_DELETE_DEFAULT');
    }

    // Verificar si tiene tweets asociados
    const tweetCount = await getCategoryTweetCount(category.name, req.user.id);

    if (tweetCount > 0) {
      throw new AppError(
        `No se puede eliminar la categoría porque tiene ${tweetCount} tweets asociados`,
        400,
        'CATEGORY_HAS_TWEETS'
      );
    }

    // Eliminar la categoría
    await prisma.category.delete({
      where: { id: parseInt(id) }
    });

    logger.info('Category deleted', {
      userId: req.user.id,
      categoryId: category.id,
      categoryName: category.name
    });

    res.json({
      success: true,
      message: 'Categoría eliminada exitosamente'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/categories/:id/move-tweets
 * Mover todos los tweets de una categoría a otra
 */
router.post('/:id/move-tweets', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { targetCategoryName } = req.body;

    if (!targetCategoryName) {
      throw new AppError('Categoría destino requerida', 400, 'MISSING_TARGET_CATEGORY');
    }

    const sourceCategory = await verifyCategoryOwnership(id, req.user.id);

    // Verificar que la categoría destino existe
    const targetCategory = await prisma.category.findFirst({
      where: {
        name: targetCategoryName,
        userId: req.user.id
      }
    });

    if (!targetCategory) {
      throw new AppError('Categoría destino no encontrada', 404, 'TARGET_CATEGORY_NOT_FOUND');
    }

    // Mover tweets
    const result = await prisma.tweet.updateMany({
      where: {
        userId: req.user.id,
        category: sourceCategory.name,
        isArchived: false
      },
      data: {
        category: targetCategoryName
      }
    });

    logger.info('Tweets moved between categories', {
      userId: req.user.id,
      sourceCategory: sourceCategory.name,
      targetCategory: targetCategoryName,
      movedCount: result.count
    });

    res.json({
      success: true,
      message: `${result.count} tweets movidos exitosamente`,
      movedCount: result.count
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/categories/colors
 * Obtener colores sugeridos para categorías
 */
router.get('/colors', (req, res) => {
  const suggestedColors = [
    { name: 'Azul', value: '#3B82F6' },
    { name: 'Verde', value: '#10B981' },
    { name: 'Rojo', value: '#EF4444' },
    { name: 'Amarillo', value: '#F59E0B' },
    { name: 'Púrpura', value: '#8B5CF6' },
    { name: 'Rosa', value: '#EC4899' },
    { name: 'Índigo', value: '#6366F1' },
    { name: 'Gris', value: '#6B7280' },
    { name: 'Naranja', value: '#F97316' },
    { name: 'Teal', value: '#14B8A6' }
  ];

  res.json({ colors: suggestedColors });
});

/**
 * POST /api/v1/categories/auto-create
 * Crear categorías automáticamente usando IA
 */
router.post('/auto-create', async (req, res, next) => {
  try {
    const userId = req.user.id;

    logger.info(`Iniciando creación automática de categorías para usuario ${userId}`);

    const result = await createAutoCategories(userId);

    logger.info('Categorías automáticas creadas:', {
      userId,
      created: result.created,
      categorized: result.categorized,
      totalProcessed: result.totalProcessed
    });

    res.json({
      success: true,
      message: 'Categorización automática completada',
      result
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/categories/recategorize
 * Recategorizar todos los tweets usando IA
 */
router.post('/recategorize', async (req, res, next) => {
  try {
    const userId = req.user.id;

    logger.info(`Iniciando recategorización de tweets para usuario ${userId}`);

    const result = await recategorizeAllTweets(userId);

    logger.info('Recategorización completada:', {
      userId,
      processed: result.processed,
      updated: result.updated
    });

    res.json({
      success: true,
      message: 'Recategorización completada',
      result
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/categories/suggestions
 * Obtener categorías sugeridas basadas en el historial del usuario
 */
router.get('/suggestions', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const suggestions = await getSuggestedCategories(userId);

    res.json({
      success: true,
      suggestions
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/categories/categorize-uncategorized
 * Categorizar solo tweets que no tienen categoría asignada
 */
router.post('/categorize-uncategorized', async (req, res, next) => {
  try {
    const userId = req.user.id;

    logger.info(`Iniciando categorización de tweets sin categoría para usuario ${userId}`);

    const result = await categorizeUncategorizedTweets(userId);

    logger.info('Categorización de tweets sin categoría completada:', {
      userId,
      found: result.found,
      categorized: result.categorized,
      processed: result.processed
    });

    res.json({
      success: true,
      message: 'Categorización de tweets sin categoría completada',
      result
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/categories/initialize-ai
 * Inicializar el modelo de IA para categorización
 */
router.post('/initialize-ai', async (req, res, next) => {
  try {
    logger.info('Inicializando modelo de IA desde endpoint...');
    
    await initializeAI();

    res.json({
      success: true,
      message: 'Modelo de IA inicializado correctamente'
    });

  } catch (error) {
    next(error);
  }
});

export default router;