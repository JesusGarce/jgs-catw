import { logger, logError } from '../utils/logger.js';

let transformersLoaded = false;
let classifier = null;

// Mapeo de categorías basado en palabras clave
const CATEGORY_KEYWORDS = {
  'Tecnología': [
    'javascript', 'python', 'react', 'node', 'programming', 'developer', 'coding', 'software',
    'ai', 'machine learning', 'artificial intelligence', 'tech', 'startup', 'app', 'web',
    'database', 'api', 'framework', 'library', 'github', 'code', 'development', 'frontend',
    'backend', 'fullstack', 'devops', 'cloud', 'aws', 'docker', 'kubernetes'
  ],
  'Noticias': [
    'breaking', 'news', 'update', 'report', 'announces', 'confirmed', 'official', 'press',
    'government', 'politics', 'economy', 'market', 'election', 'policy', 'crisis', 'event',
    'happened', 'breaking news', 'urgent', 'alert', 'announced', 'statement'
  ],
  'Educación': [
    'learn', 'learning', 'education', 'tutorial', 'guide', 'how to', 'tips', 'course',
    'training', 'skill', 'knowledge', 'study', 'research', 'academic', 'university',
    'school', 'teaching', 'lesson', 'workshop', 'certification', 'degree'
  ],
  'Inspiración': [
    'motivation', 'inspiration', 'quote', 'wisdom', 'success', 'mindset', 'growth',
    'achievement', 'goal', 'dream', 'believe', 'inspire', 'motivated', 'positive',
    'life lesson', 'advice', 'encourage', 'perseverance', 'determination'
  ],
  'Entretenimiento': [
    'movie', 'film', 'music', 'game', 'gaming', 'entertainment', 'fun', 'funny',
    'meme', 'video', 'show', 'series', 'netflix', 'spotify', 'youtube', 'streaming',
    'celebrity', 'actor', 'singer', 'artist', 'comedy'
  ],
  'Deportes': [
    'football', 'soccer', 'basketball', 'tennis', 'sports', 'game', 'match', 'player',
    'team', 'score', 'goal', 'win', 'championship', 'league', 'tournament', 'athlete',
    'fitness', 'workout', 'training', 'exercise', 'gym'
  ],
  'Negocios': [
    'business', 'entrepreneur', 'startup', 'company', 'investment', 'finance', 'money',
    'market', 'stock', 'revenue', 'profit', 'strategy', 'marketing', 'sales', 'customer',
    'product', 'service', 'brand', 'growth', 'innovation', 'leadership', 'management'
  ]
};

/**
 * Inicializar el modelo de IA (Transformers.js)
 */
export async function initializeAI() {
  if (process.env.ENABLE_AUTO_CATEGORIZATION !== 'true') {
    logger.info('🤖 Categorización automática deshabilitada');
    return;
  }

  try {
    logger.info('🤖 Inicializando modelo de categorización...');
    
    // Por ahora usar categorización basada en palabras clave
    // En el futuro, cargar Transformers.js aquí
    /*
    const { pipeline } = await import('@xenova/transformers');
    classifier = await pipeline(
      'text-classification',
      'cardiffnlp/twitter-roberta-base-sentiment-latest'
    );
    */
    
    transformersLoaded = true;
    logger.info('✅ Modelo de categorización inicializado (modo keywords)');

  } catch (error) {
    logError(error, { context: 'initialize_ai' });
    logger.warn('⚠️ Error inicializando IA, usando categorización por palabras clave');
    transformersLoaded = false;
  }
}

/**
 * Categorizar un tweet basado en su contenido
 */
export async function categorizeTweet(content, userId = null) {
  try {
    if (!content || typeof content !== 'string') {
      return { category: 'General', confidence: 0.5 };
    }

    const normalizedContent = content.toLowerCase();
    
    // Método 1: Categorización por palabras clave
    const keywordResult = categorizeByKeywords(normalizedContent);
    
    // Si tenemos alta confianza, usar ese resultado
    if (keywordResult.confidence > 0.7) {
      return keywordResult;
    }

    // Método 2: Si Transformers.js está disponible, usarlo
    if (transformersLoaded && classifier) {
      try {
        const aiResult = await categorizeWithAI(content);
        if (aiResult.confidence > keywordResult.confidence) {
          return aiResult;
        }
      } catch (error) {
        logger.warn('Error usando IA, fallback a keywords:', error.message);
      }
    }

    // Método 3: Análisis de contexto adicional
    const contextResult = categorizeByContext(normalizedContent);
    
    // Retornar el resultado con mayor confianza
    const results = [keywordResult, contextResult].sort((a, b) => b.confidence - a.confidence);
    
    return results[0];

  } catch (error) {
    logError(error, { context: 'categorize_tweet', content: content?.substring(0, 100) });
    return { category: 'General', confidence: 0.3 };
  }
}

/**
 * Categorización basada en palabras clave
 */
function categorizeByKeywords(content) {
  const scores = {};
  let totalMatches = 0;

  // Calcular puntuación para cada categoría
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let matches = 0;
    
    for (const keyword of keywords) {
      if (content.includes(keyword.toLowerCase())) {
        matches++;
        totalMatches++;
      }
    }
    
    scores[category] = matches;
  }

  // Encontrar la categoría con más matches
  const bestCategory = Object.keys(scores).reduce((a, b) => 
    scores[a] > scores[b] ? a : b
  );

  const bestScore = scores[bestCategory];
  const confidence = totalMatches > 0 ? Math.min(bestScore / totalMatches, 1.0) : 0.1;

  return {
    category: bestScore > 0 ? bestCategory : 'General',
    confidence: bestScore > 0 ? Math.max(confidence, 0.5) : 0.3,
    method: 'keywords',
    details: { matches: bestScore, totalKeywords: CATEGORY_KEYWORDS[bestCategory]?.length || 0 }
  };
}

/**
 * Categorización por contexto (URLs, menciones, hashtags)
 */
function categorizeByContext(content) {
  const indicators = {
    'Tecnología': [
      'github.com', 'stackoverflow.com', 'dev.to', 'medium.com/@tech',
      '#programming', '#coding', '#javascript', '#python', '#react'
    ],
    'Noticias': [
      'cnn.com', 'bbc.com', 'reuters.com', 'nytimes.com',
      '#breaking', '#news', '#update'
    ],
    'Educación': [
      'coursera.org', 'udemy.com', 'khan', 'education',
      '#learning', '#tutorial', '#education'
    ],
    'Negocios': [
      'linkedin.com', 'forbes.com', 'bloomberg.com',
      '#business', '#startup', '#entrepreneur'
    ]
  };

  let bestCategory = 'General';
  let maxScore = 0;

  for (const [category, patterns] of Object.entries(indicators)) {
    let score = 0;
    
    for (const pattern of patterns) {
      if (content.includes(pattern.toLowerCase())) {
        score += pattern.startsWith('#') ? 2 : 1; // Hashtags tienen más peso
      }
    }
    
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  return {
    category: bestCategory,
    confidence: maxScore > 0 ? Math.min(0.3 + (maxScore * 0.2), 0.9) : 0.2,
    method: 'context',
    details: { contextMatches: maxScore }
  };
}

/**
 * Categorización con IA (placeholder para Transformers.js)
 */
async function categorizeWithAI(content) {
  // Placeholder - implementar cuando se agregue Transformers.js
  return {
    category: 'General',
    confidence: 0.4,
    method: 'ai',
    details: { model: 'placeholder' }
  };
}

/**
 * Procesar múltiples tweets en lote
 */
export async function batchCategorize(tweets) {
  const results = [];
  
  for (const tweet of tweets) {
    try {
      const result = await categorizeTweet(tweet.content, tweet.userId);
      results.push({
        tweetId: tweet.id || tweet.tweetId,
        ...result
      });
    } catch (error) {
      logError(error, { context: 'batch_categorize', tweetId: tweet.id });
      results.push({
        tweetId: tweet.id || tweet.tweetId,
        category: 'General',
        confidence: 0.2,
        error: true
      });
    }
  }

  return results;
}

/**
 * Obtener categorías sugeridas para un usuario basadas en su historial
 */
export async function getSuggestedCategories(userId) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    // Obtener tweets más recientes del usuario
    const recentTweets = await prisma.tweet.findMany({
      where: { userId, isArchived: false },
      select: { content: true },
      orderBy: { bookmarkedAt: 'desc' },
      take: 50
    });

    if (recentTweets.length === 0) {
      return Object.keys(CATEGORY_KEYWORDS).map(name => ({ name, confidence: 0.5 }));
    }

    // Analizar contenido para sugerir categorías
    const categoryFrequency = {};
    
    for (const tweet of recentTweets) {
      const result = await categorizeTweet(tweet.content, userId);
      if (result.confidence > 0.5) {
        categoryFrequency[result.category] = (categoryFrequency[result.category] || 0) + 1;
      }
    }

    // Convertir a sugerencias ordenadas
    const suggestions = Object.entries(categoryFrequency)
      .map(([name, frequency]) => ({
        name,
        confidence: Math.min(frequency / recentTweets.length, 1.0),
        frequency
      }))
      .sort((a, b) => b.confidence - a.confidence);

    return suggestions;

  } catch (error) {
    logError(error, { context: 'get_suggested_categories', userId });
    return [];
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Configurar categorías personalizadas para un usuario
 */
export function addCustomKeywords(category, keywords) {
  if (!CATEGORY_KEYWORDS[category]) {
    CATEGORY_KEYWORDS[category] = [];
  }
  
  CATEGORY_KEYWORDS[category] = [
    ...CATEGORY_KEYWORDS[category],
    ...keywords.map(k => k.toLowerCase())
  ];
  
  logger.info(`Agregadas ${keywords.length} palabras clave a categoría ${category}`);
}

export default {
  initializeAI,
  categorizeTweet,
  batchCategorize,
  getSuggestedCategories,
  addCustomKeywords
};