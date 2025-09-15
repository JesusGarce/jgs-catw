import { logger, logError } from '../utils/logger.js';

let transformersLoaded = false;
var sentimentPipeline = null;

// Mapeo de categorías basado en palabras clave
const CATEGORY_KEYWORDS = {
  'Frontend': [
    'html', 'css', 'javascript', 'typescript', 'react', 'angular', 'vue', 'svelte',
    'nextjs', 'nuxt', 'tailwind', 'bootstrap', 'material ui', 'chakra ui', 'astro',
    'frontend', 'ui', 'ux', 'design', 'responsive', 'components', 'web design'
  ],

  'Backend': [
    'node', 'express', 'nest', 'django', 'flask', 'spring boot', 'ruby on rails',
    'laravel', 'php', 'golang', 'java', 'dotnet', '.net', 'api', 'rest', 'graphql',
    'microservices', 'server', 'backend', 'middleware', 'queue', 'worker'
  ],

  'Inteligencia Artificial y Machine Learning': [
    'ai', 'machine learning', 'ml', 'deep learning', 'nlp', 'openai', 'chatgpt',
    'llm', 'gpt', 'bert', 'transformer', 'stable diffusion', 'computer vision',
    'generative ai', 'prompt engineering', 'neural network', 'tensorflow', 'pytorch'
  ],

  'Ciberseguridad': [
    'cybersecurity', 'hacking', 'pentesting', 'malware', 'ransomware', 'phishing',
    'owasp', 'exploit', 'firewall', 'encryption', 'ssl', 'ddos', 'vpn', 'bug bounty',
    'zeroday', 'osint', 'forensics', 'security', 'authentication', 'authorization'
  ],

  'DevOps y Cloud': [
    'devops', 'cloud', 'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'helm', 'terraform',
    'ansible', 'ci/cd', 'jenkins', 'github actions', 'monitoring', 'grafana', 'prometheus',
    'observability', 'logging', 'scalability', 'infrastructure', 'load balancing'
  ],

  'Bases de Datos': [
    'database', 'sql', 'mysql', 'postgres', 'postgresql', 'mariadb', 'oracle', 'sqlserver',
    'mongodb', 'nosql', 'redis', 'elasticsearch', 'cassandra', 'bigquery', 'firestore',
    'prisma', 'typeorm', 'sequelize', 'data modeling', 'query', 'indexing', 'sharding'
  ],

  'Programación General': [
    'programming', 'developer', 'coding', 'software', 'algorithm', 'data structure',
    'debugging', 'clean code', 'refactoring', 'performance', 'testing', 'tdd',
    'bdd', 'unit test', 'integration test', 'design patterns', 'architecture'
  ],

  'Cursos y Formación': [
    'tutorial', 'course', 'bootcamp', 'training', 'workshop', 'certification',
    'learn', 'learning', 'guide', 'how to', 'tips', 'roadmap', 'freecodecamp',
    'udemy', 'platzi', 'coursera', 'edx', 'academy', 'study', 'skill'
  ],

  'Startups y Nuevas Tecnologías': [
    'startup', 'innovation', 'tech', 'app', 'web', 'product', 'saas', 'blockchain',
    'web3', 'metaverse', 'nft', 'crypto', 'token', 'solidity', 'ethereum', 'bitcoin',
    'ar', 'vr', 'xr', 'quantum computing', 'robotics', 'iot', 'edge computing'
  ],

  'Noticias y Tendencias Tecnológicas': [
    'release', 'update', 'breaking', 'announcement', 'trending', 'new version',
    'beta', 'alpha', 'launch', 'roadmap', 'rumors', 'patch', 'security update',
    'stable', 'deprecated', 'support ended', 'feature', 'bugfix', 'performance'
  ],
  'Noticias Generales': [
    'noticia', 'breaking', 'news', 'última hora', 'actualidad', 'informe',
    'reportaje', 'report', 'announces', 'confirmed', 'official', 'press', 'statement'
  ],
  'Política y Gobierno': [
    'política', 'gobierno', 'parlamento', 'elecciones', 'election', 'referéndum',
    'presidente', 'ministro', 'ley', 'policy', 'senado', 'diputados', 'manifestación',
    'protesta', 'congreso', 'campaña electoral'
  ],
  'Economía y Mercados': [
    'economía', 'mercados', 'bolsa', 'acciones', 'inflación', 'crisis', 'impuestos',
    'banco central', 'intereses', 'mercado financiero', 'subida precios', 'crypto',
    'bitcoin', 'nasdaq', 'dow jones', 'euribor', 'mercado', 'divisas', 'recesión'
  ],
  'Eventos y Sucesos': [
    'evento', 'breaking news', 'tragedia', 'accidente', 'catástrofe', 'desastre',
    'sismo', 'terremoto', 'huracán', 'alerta', 'incendio', 'suceso', 'urgente', 'emergencia'
  ],
  'Ciencia y Salud': [
    'salud', 'vacunas', 'pandemia', 'covid', 'investigación', 'ciencia', 'hospital',
    'enfermedad', 'tratamiento', 'descubrimiento', 'virus', 'salud pública',
    'oms', 'medicina', 'farmacéutica', 'biotecnología'
  ],

  // ────────────────────────────────
  // 🎓 EDUCACIÓN Y FORMACIÓN
  // ────────────────────────────────
  'Educación Formal': [
    'educación', 'universidad', 'colegio', 'escuela', 'instituto', 'grado', 'máster',
    'doctorado', 'profesor', 'estudiante', 'alumno', 'beca', 'examen', 'clases presenciales'
  ],
  'Aprendizaje Online': [
    'e-learning', 'curso online', 'clases online', 'tutorial', 'bootcamp', 'roadmap',
    'udemy', 'platzi', 'coursera', 'edx', 'freecodecamp', 'openclassrooms'
  ],
  'Formación Profesional y Certificaciones': [
    'certificación', 'workshop', 'taller', 'capacitación', 'formación técnica', 'skill',
    'habilidades', 'reskilling', 'upskilling', 'capacitar', 'linkedin learning'
  ],
  'Investigación y Publicaciones': [
    'investigación', 'research', 'paper', 'congreso científico', 'academic',
    'estudio', 'descubrimiento', 'tesis', 'proyecto universitario', 'publicación'
  ],

  // ────────────────────────────────
  // 💡 INSPIRACIÓN Y DESARROLLO PERSONAL
  // ────────────────────────────────
  'Frases Motivacionales': [
    'motivación', 'inspiración', 'cita', 'frase', 'quote', 'sabiduría', 'mindset',
    'crecimiento personal', 'superación', 'perseverancia', 'determinación'
  ],
  'Éxito y Productividad': [
    'productividad', 'éxito', 'disciplina', 'organización', 'planificación',
    'eficiencia', 'gestión del tiempo', 'logro', 'objetivos', 'progreso'
  ],
  'Desarrollo Personal': [
    'crecimiento', 'autoestima', 'desarrollo personal', 'mentalidad', 'propósito',
    'liderazgo', 'mental health', 'bienestar emocional', 'coaching'
  ],

  // ────────────────────────────────
  // 🎭 ENTRETENIMIENTO Y CULTURA POP
  // ────────────────────────────────
  'Cine y Series': [
    'película', 'movie', 'film', 'serie', 'netflix', 'hbo', 'prime video', 'disney+',
    'estreno', 'tráiler', 'spoiler', 'actor', 'actriz', 'director', 'oscar', 'premios'
  ],
  'Música y Conciertos': [
    'música', 'spotify', 'concierto', 'álbum', 'single', 'canción', 'tour',
    'festival', 'banda', 'dj', 'cantante', 'singer', 'billboard'
  ],
  'Gaming y Esports': [
    'gaming', 'videojuegos', 'esports', 'twitch', 'streaming', 'steam', 'ps5',
    'xbox', 'nintendo', 'league of legends', 'fortnite', 'valorant', 'csgo'
  ],
  'Memes y Cultura Internet': [
    'meme', 'funny', 'viral', 'trend', 'shitpost', 'parodia', 'tiktok',
    'youtube', 'instagram', 'reels', 'humor', 'challenge'
  ],

  // ────────────────────────────────
  // ⚽ DEPORTES Y FITNESS
  // ────────────────────────────────
  'Fútbol': [
    'fútbol', 'football', 'soccer', 'champions', 'laliga', 'premier league', 'liga mx',
    'balón de oro', 'cristiano', 'messi', 'gol', 'penalti', 'var', 'entrenador'
  ],
  'Baloncesto y Otros Deportes': [
    'baloncesto', 'nba', 'basket', 'tenis', 'f1', 'motogp', 'rugby', 'boxeo',
    'natación', 'voleibol', 'atletismo', 'olimpiadas'
  ],
  'Fitness y Salud': [
    'gym', 'fitness', 'entrenamiento', 'workout', 'crossfit', 'rutina', 'dieta',
    'nutrición', 'salud física', 'pesas', 'cardio'
  ],

  // ────────────────────────────────
  // 💼 NEGOCIOS Y FINANZAS
  // ────────────────────────────────
  'Negocios y Startups': [
    'negocio', 'empresa', 'startup', 'emprendimiento', 'innovación', 'escala',
    'fundador', 'inversores', 'modelo de negocio', 'pymes', 'saas'
  ],
  'Inversiones y Finanzas': [
    'inversión', 'bolsa', 'acciones', 'criptomonedas', 'trading', 'broker', 'nasdaq',
    'finanzas', 'deuda', 'fondos', 'patrimonio', 'divisas', 'mercado financiero'
  ],
  'Marketing y Ventas': [
    'marketing', 'publicidad', 'ventas', 'clientes', 'branding', 'posicionamiento',
    'estrategia digital', 'seo', 'sem', 'community manager', 'campaña', 'crecimiento'
  ],
  'Liderazgo y Gestión': [
    'liderazgo', 'management', 'gestión de equipos', 'dirección', 'plan estratégico',
    'reclutamiento', 'recursos humanos', 'coaching empresarial'
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
    logger.info('🤖 Inicializando modelo de categorización con Transformers.js...');
    
    // Cargar Transformers.js para clasificación de texto
    const { pipeline } = await import('@xenova/transformers');
    
    // Usar un modelo de análisis de sentimientos más estable
    sentimentPipeline = await pipeline(
      'sentiment-analysis',
      'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
      {
        // Configuración para optimizar rendimiento
        quantized: true,
        progress_callback: (progress) => {
          if (progress.status === 'downloading') {
            logger.info(`📥 Descargando modelo: ${Math.round(progress.progress * 100)}%`);
          }
        }
      }
    );
    
    transformersLoaded = true;
    logger.info('✅ Modelo de categorización Transformers.js inicializado correctamente');

  } catch (error) {
    logError(error, { context: 'initialize_ai' });
    logger.warn('⚠️ Error inicializando Transformers.js, usando categorización por palabras clave');
    transformersLoaded = false;
  }
}

/**
 * Categorizar un tweet basado en su contenido (múltiples categorías)
 */
export async function categorizeTweet(content, userId = null) {
  try {
    if (!content || typeof content !== 'string') {
      return { categories: [{ category: 'General', confidence: 0.5, isPrimary: true }] };
    }

    const normalizedContent = content.toLowerCase();
    
    // Método 1: Categorización por palabras clave (múltiples)
    const keywordResults = categorizeByKeywordsMultiple(normalizedContent);
    
    // Método 2: Si Transformers.js está disponible, usarlo
    let aiResults = [];
    if (transformersLoaded && sentimentPipeline) {
      try {
        aiResults = await categorizeWithAIMultiple(content);
      } catch (error) {
        logger.warn('Error usando IA, fallback a keywords:', error.message);
      }
    }

    // Método 3: Análisis de contexto adicional
    const contextResults = categorizeByContextMultiple(normalizedContent);
    
    // Combinar todos los resultados y eliminar duplicados
    const allResults = [...keywordResults, ...aiResults, ...contextResults];
    const uniqueCategories = combineAndRankCategories(allResults);
    
    // Asegurar que siempre hay al menos una categoría
    if (uniqueCategories.length === 0) {
      uniqueCategories.push({ category: 'General', confidence: 0.3, isPrimary: true });
    }

    return { categories: uniqueCategories };

  } catch (error) {
    logError(error, { context: 'categorize_tweet', content: content?.substring(0, 100) });
    return { categories: [{ category: 'General', confidence: 0.3, isPrimary: true }] };
  }
}

/**
 * Categorización basada en palabras clave (múltiples categorías)
 */
function categorizeByKeywordsMultiple(content) {
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
    
    if (matches > 0) {
      scores[category] = matches;
    }
  }

  // Convertir a array de resultados y ordenar por confianza
  const results = Object.entries(scores)
    .map(([category, matches]) => {
      const confidence = Math.min(matches / Math.max(totalMatches, 1), 1.0);
      return {
        category,
        confidence: Math.max(confidence, 0.3),
        method: 'keywords',
        details: { matches, totalKeywords: CATEGORY_KEYWORDS[category]?.length || 0 }
      };
    })
    .sort((a, b) => b.confidence - a.confidence);

  // Marcar la primera como principal si tiene alta confianza
  if (results.length > 0 && results[0].confidence > 0.6) {
    results[0].isPrimary = true;
  }

  return results;
}

/**
 * Categorización basada en palabras clave (versión original para compatibilidad)
 */
function categorizeByKeywords(content) {
  const results = categorizeByKeywordsMultiple(content);
  return results.length > 0 ? results[0] : { category: 'General', confidence: 0.3, method: 'keywords' };
}

/**
 * Categorización por contexto (múltiples categorías)
 */
function categorizeByContextMultiple(content) {
  const indicators = {
    'Frontend': [
      'github.com', 'stackoverflow.com', 'dev.to', 'medium.com/@tech',
      '#programming', '#coding', '#javascript', '#python', '#react', '#frontend'
    ],
    'Noticias Generales': [
      'cnn.com', 'bbc.com', 'reuters.com', 'nytimes.com',
      '#breaking', '#news', '#update', '#noticias'
    ],
    'Cursos y Formación': [
      'coursera.org', 'udemy.com', 'khan', 'education',
      '#learning', '#tutorial', '#education', '#curso'
    ],
    'Negocios y Startups': [
      'linkedin.com', 'forbes.com', 'bloomberg.com',
      '#business', '#startup', '#entrepreneur', '#negocio'
    ],
    'Inteligencia Artificial y Machine Learning': [
      '#ai', '#machinelearning', '#ml', '#chatgpt', '#openai'
    ],
    'Ciberseguridad': [
      '#cybersecurity', '#hacking', '#security', '#pentesting'
    ]
  };

  const results = [];

  for (const [category, patterns] of Object.entries(indicators)) {
    let score = 0;
    
    for (const pattern of patterns) {
      if (content.includes(pattern.toLowerCase())) {
        score += pattern.startsWith('#') ? 2 : 1; // Hashtags tienen más peso
      }
    }
    
    if (score > 0) {
      results.push({
        category,
        confidence: Math.min(0.3 + (score * 0.2), 0.9),
        method: 'context',
        details: { contextMatches: score }
      });
    }
  }

  // Ordenar por confianza y marcar la primera como principal
  results.sort((a, b) => b.confidence - a.confidence);
  if (results.length > 0 && results[0].confidence > 0.5) {
    results[0].isPrimary = true;
  }

  return results;
}

/**
 * Categorización con IA usando Transformers.js (múltiples categorías)
 */
async function categorizeWithAIMultiple(content) {
  if (!sentimentPipeline) {
    throw new Error('Modelo de IA no inicializado');
  }

  try {
    // Limpiar y preparar el texto para el modelo
    const cleanContent = content
      .replace(/https?:\/\/[^\s]+/g, '') // Remover URLs
      .replace(/@\w+/g, '') // Remover menciones
      .replace(/#\w+/g, '') // Remover hashtags
      .trim();

    if (cleanContent.length < 10) {
      return [{
        category: 'General',
        confidence: 0.3,
        method: 'ai',
        isPrimary: true,
        details: { reason: 'contenido_muy_corto' }
      }];
    }

    // Usar el modelo para análisis de sentimientos
    const result = await sentimentPipeline(cleanContent);
    
    // El modelo de sentimiento nos da: NEGATIVE o POSITIVE
    const sentiment = result[0];
    const results = [];

    // Combinar sentimiento con análisis de palabras clave para mejor categorización
    const keywordResults = categorizeByKeywordsMultiple(content.toLowerCase());
    
    // Si las palabras clave tienen alta confianza, usarlas como base
    if (keywordResults.length > 0 && keywordResults[0].confidence > 0.6) {
      // Usar las categorías de keywords como base
      results.push(...keywordResults.slice(0, 3)); // Máximo 3 categorías de keywords
    } else {
      // Usar sentimiento para categorizar
      let sentimentCategory = 'General';
      let sentimentConfidence = sentiment.score;

      switch (sentiment.label) {
        case 'POSITIVE': // Positivo
          if (content.toLowerCase().includes('motivation') || content.toLowerCase().includes('success')) {
            sentimentCategory = 'Frases Motivacionales';
          } else if (content.toLowerCase().includes('learn') || content.toLowerCase().includes('education')) {
            sentimentCategory = 'Cursos y Formación';
          } else {
            sentimentCategory = 'General';
          }
          break;
        case 'NEGATIVE': // Negativo
          sentimentCategory = 'Noticias Generales'; // Contenido negativo suele ser noticias
          break;
        default:
          sentimentCategory = 'General';
          break;
      }

      results.push({
        category: sentimentCategory,
        confidence: Math.min(sentimentConfidence, 0.9),
        method: 'ai',
        isPrimary: true,
        details: {
          sentiment: sentiment.label,
          sentimentScore: sentiment.score,
          model: 'distilbert-base-uncased-finetuned-sst-2-english'
        }
      });
    }

    // Marcar la primera como principal
    if (results.length > 0) {
      results[0].isPrimary = true;
    }

    return results;

  } catch (error) {
    logger.warn('Error en categorización con IA:', error.message);
    throw error;
  }
}

/**
 * Combinar y rankear categorías de diferentes métodos
 */
function combineAndRankCategories(allResults) {
  const categoryMap = new Map();

  // Agrupar por nombre de categoría
  for (const result of allResults) {
    const categoryName = result.category;
    
    if (!categoryMap.has(categoryName)) {
      categoryMap.set(categoryName, {
        category: categoryName,
        confidence: 0,
        methods: [],
        isPrimary: false,
        details: {}
      });
    }

    const existing = categoryMap.get(categoryName);
    
    // Combinar confianzas (promedio ponderado)
    const weight = result.method === 'keywords' ? 1.2 : result.method === 'ai' ? 1.0 : 0.8;
    existing.confidence = (existing.confidence + (result.confidence * weight)) / 2;
    
    // Agregar método
    if (!existing.methods.includes(result.method)) {
      existing.methods.push(result.method);
    }
    
    // Marcar como principal si alguna de las fuentes lo indica
    if (result.isPrimary) {
      existing.isPrimary = true;
    }
    
    // Combinar detalles
    existing.details = { ...existing.details, ...result.details };
  }

  // Convertir a array y ordenar por confianza
  const rankedCategories = Array.from(categoryMap.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5); // Máximo 5 categorías

  // Asegurar que solo una sea principal
  if (rankedCategories.length > 0) {
    rankedCategories.forEach((cat, index) => {
      cat.isPrimary = index === 0 && cat.confidence > 0.4;
    });
  }

  return rankedCategories;
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
        categories: [{ category: 'General', confidence: 0.2, isPrimary: true }],
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

/**
 * Crear categorías automáticamente para un usuario basadas en tweets existentes
 */
export async function createAutoCategories(userId) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    // Obtener tweets sin categoría del usuario
    const uncategorizedTweets = await prisma.tweet.findMany({
      where: {
        userId,
        isArchived: false,
        OR: [
          { category: null },
          { category: 'General' }
        ]
      },
      select: { id: true, content: true },
      take: 100 // Procesar máximo 100 tweets para crear categorías
    });

    if (uncategorizedTweets.length === 0) {
      logger.info('No hay tweets para categorizar automáticamente');
      return { created: 0, categorized: 0 };
    }

    // Categorizar tweets
    const categorizationResults = await batchCategorize(uncategorizedTweets);
    
    // Agrupar por categoría
    const categoryGroups = {};
    categorizationResults.forEach(result => {
      if (!categoryGroups[result.category]) {
        categoryGroups[result.category] = [];
      }
      categoryGroups[result.category].push(result);
    });

    let createdCategories = 0;
    let categorizedTweets = 0;

    // Crear categorías que no existen y actualizar tweets
    for (const [categoryName, tweets] of Object.entries(categoryGroups)) {
      if (categoryName === 'General') continue; // Saltar General

      // Verificar si la categoría ya existe
      let category = await prisma.category.findFirst({
        where: {
          userId,
          name: categoryName
        }
      });

      // Crear categoría si no existe
      if (!category) {
        const colors = ['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1', '#F97316'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        category = await prisma.category.create({
          data: {
            name: categoryName,
            description: `Categoría generada automáticamente por IA`,
            color: randomColor,
            userId,
            sortOrder: 1000 + createdCategories, // Colocar al final
            isDefault: false
          }
        });

        createdCategories++;
        logger.info(`Categoría automática creada: ${categoryName} para usuario ${userId}`);
      }

      // Actualizar tweets con la nueva categoría
      const tweetIds = tweets.map(t => t.tweetId);
      const updateResult = await prisma.tweet.updateMany({
        where: {
          id: { in: tweetIds },
          userId
        },
        data: {
          category: categoryName
        }
      });

      categorizedTweets += updateResult.count;
    }

    logger.info(`Categorización automática completada para usuario ${userId}:`, {
      createdCategories,
      categorizedTweets,
      totalProcessed: uncategorizedTweets.length
    });

    return {
      created: createdCategories,
      categorized: categorizedTweets,
      totalProcessed: uncategorizedTweets.length
    };

  } catch (error) {
    logError(error, { context: 'create_auto_categories', userId });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Recategorizar un tweet individual usando IA
 */
export async function recategorizeSingleTweet(tweetId, userId) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    // Obtener el tweet específico
    const tweet = await prisma.tweet.findFirst({
      where: {
        id: tweetId,
        userId,
        isArchived: false
      },
      select: { id: true, content: true, category: true }
    });

    if (!tweet) {
      throw new Error('Tweet no encontrado o no pertenece al usuario');
    }

    // Categorizar el tweet usando IA
    const result = await categorizeTweet(tweet.content, userId);
    
    if (!result.categories || result.categories.length === 0) {
      throw new Error('No se pudieron generar categorías para el tweet');
    }

    // Obtener la categoría principal
    const primaryCategory = result.categories.find(cat => cat.isPrimary) || result.categories[0];
    
    // Actualizar la categoría del tweet
    await prisma.tweet.update({
      where: { id: tweetId },
      data: { category: primaryCategory.category }
    });

    // Guardar todas las categorías del tweet (relación many-to-many)
    await saveTweetCategories(tweetId, result.categories, userId);

    // Actualizar conteos de categorías
    await updateCategoryTweetCounts(userId);

    logger.info(`Tweet ${tweetId} recategorizado exitosamente:`, {
      oldCategory: tweet.category,
      newCategory: primaryCategory.category,
      confidence: primaryCategory.confidence,
      totalCategories: result.categories.length
    });

    return {
      success: true,
      tweetId,
      oldCategory: tweet.category,
      newCategory: primaryCategory.category,
      confidence: primaryCategory.confidence,
      allCategories: result.categories
    };

  } catch (error) {
    logError(error, { context: 'recategorize_single_tweet', tweetId, userId });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Recategorizar todos los tweets de un usuario usando IA
 */
export async function recategorizeAllTweets(userId) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    // Obtener todos los tweets del usuario
    const tweets = await prisma.tweet.findMany({
      where: {
        userId,
        isArchived: false
      },
      select: { id: true, content: true, category: true },
      take: 500 // Limitar para evitar sobrecarga
    });

    if (tweets.length === 0) {
      return { processed: 0, updated: 0 };
    }

    // Categorizar todos los tweets
    const results = await batchCategorize(tweets);
    
    let updatedCount = 0;

    // Actualizar tweets con nuevas categorías
    for (const result of results) {
      if (result.error) continue; // Saltar tweets con error
      
      const tweet = tweets.find(t => t.id === result.tweetId);
      if (!tweet || !result.categories || result.categories.length === 0) continue;
      
      // Obtener la categoría principal
      const primaryCategory = result.categories.find(cat => cat.isPrimary) || result.categories[0];
      
              // Actualizar la categoría principal en el campo legacy
              await prisma.tweet.update({
                where: { id: result.tweetId },
                data: { category: primaryCategory.category }
              });
              
              // Guardar todas las categorías múltiples
              await saveTweetCategories(result.tweetId, result.categories, userId);
              
              updatedCount++;
    }

    // Actualizar conteos de categorías
    await updateCategoryTweetCounts(userId);

    logger.info(`Recategorización completada para usuario ${userId}:`, {
      totalTweets: tweets.length,
      updatedTweets: updatedCount
    });

    return {
      processed: tweets.length,
      updated: updatedCount
    };

  } catch (error) {
    logError(error, { context: 'recategorize_all_tweets', userId });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Guardar categorías de un tweet en la base de datos (relación many-to-many)
 */
export async function saveTweetCategories(tweetId, categories, userId) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    // Eliminar categorías existentes del tweet
    await prisma.tweetCategory.deleteMany({
      where: { tweetId }
    });

    // Guardar nuevas categorías
    for (const cat of categories) {
      // Buscar o crear la categoría
      let category = await prisma.category.findFirst({
        where: {
          userId,
          name: cat.category
        }
      });

      if (!category) {
        // Crear categoría si no existe
        const colors = ['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1', '#F97316'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        category = await prisma.category.create({
          data: {
            name: cat.category,
            description: `Categoría generada automáticamente por IA`,
            color: randomColor,
            userId,
            sortOrder: 1000,
            isDefault: false
          }
        });
      }

      // Crear relación tweet-categoría
      await prisma.tweetCategory.create({
        data: {
          tweetId,
          categoryId: category.id,
          confidence: cat.confidence,
          isPrimary: cat.isPrimary || false
        }
      });
    }

    // Actualizar la categoría principal en el campo legacy del tweet
    const primaryCategory = categories.find(cat => cat.isPrimary);
    if (primaryCategory) {
      await prisma.tweet.update({
        where: { id: tweetId },
        data: { category: primaryCategory.category }
      });
    }

    logger.info(`Categorías guardadas para tweet ${tweetId}:`, {
      categories: categories.map(cat => `${cat.category} (${cat.confidence})`)
    });

  } catch (error) {
    logError(error, { context: 'save_tweet_categories', tweetId, userId });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Obtener categorías de un tweet desde la base de datos
 */
export async function getTweetCategories(tweetId) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const tweetCategories = await prisma.tweetCategory.findMany({
      where: { tweetId },
      include: {
        category: true
      },
      orderBy: [
        { isPrimary: 'desc' },
        { confidence: 'desc' }
      ]
    });

    return tweetCategories.map(tc => ({
      id: tc.category.id,
      name: tc.category.name,
      color: tc.category.color,
      confidence: tc.confidence,
      isPrimary: tc.isPrimary
    }));

  } catch (error) {
    logError(error, { context: 'get_tweet_categories', tweetId });
    return [];
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Actualizar conteo de tweets por categoría
 */
export async function updateCategoryTweetCounts(userId) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    // Obtener todas las categorías del usuario
    const categories = await prisma.category.findMany({
      where: { userId }
    });

    // Actualizar conteo para cada categoría
    for (const category of categories) {
      const count = await prisma.tweetCategory.count({
        where: {
          categoryId: category.id,
          tweet: {
            isArchived: false
          }
        }
      });

      await prisma.category.update({
        where: { id: category.id },
        data: { tweetCount: count }
      });
    }

    logger.info(`Conteos de tweets actualizados para usuario ${userId}`);

  } catch (error) {
    logError(error, { context: 'update_category_tweet_counts', userId });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

export default {
  initializeAI,
  categorizeTweet,
  batchCategorize,
  getSuggestedCategories,
  addCustomKeywords,
  createAutoCategories,
  recategorizeSingleTweet,
  recategorizeAllTweets,
  saveTweetCategories,
  getTweetCategories,
  updateCategoryTweetCounts
};