import { logger, logError } from '../utils/logger.js';
import { PrismaClient } from '@prisma/client';

let transformersLoaded = false;
var sentimentPipeline = null;

// Instancia singleton de Prisma
const prisma = new PrismaClient();

// ────────────────────────────────
// 🛠️ UTILIDADES Y HELPERS
// ────────────────────────────────

/**
 * Ejecutar operación con Prisma con manejo de errores
 */
async function withPrisma(operation, context = '') {
  try {
    return await operation(prisma);
  } catch (error) {
    logError(error, { context });
    throw error;
  }
}

/**
 * Crear categoría si no existe
 */
async function findOrCreateCategory(categoryName, userId, prisma) {
  let category = await prisma.category.findFirst({
    where: { userId, name: categoryName }
  });

  if (!category) {
    const colors = ['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1', '#F97316'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    category = await prisma.category.create({
      data: {
        name: categoryName,
        description: `Categoría generada automáticamente por IA`,
        color: randomColor,
        userId,
        sortOrder: 1000,
        isDefault: false
      }
    });
  }

  return category;
}

/**
 * Verificar si la tabla TweetCategory existe
 */
async function checkTweetCategoryTableExists(prisma) {
  try {
    await prisma.tweetCategory.findFirst({ take: 1 });
    return true;
  } catch (error) {
    return false;
  }
}

// Mapeo de categorías basado en palabras clave
const CATEGORY_KEYWORDS = {
  'Frontend': [
    'html', 'css', 'javascript', 'typescript', 'react', 'angular', 'vue', 'svelte',
    'nextjs', 'nuxt', 'remix', 'solidjs', 'astro', 'tailwind', 'bootstrap',
    'material ui', 'chakra ui', 'shadcn', 'storybook',
    'frontend', 'ui', 'ux', 'design', 'responsive', 'components', 'web design'
  ],

  'Backend': [
    'node', 'express', 'nest', 'deno', 'bun', 'django', 'flask', 'spring boot',
    'ruby on rails', 'laravel', 'php', 'golang', 'java', 'dotnet', '.net',
    'api', 'rest', 'graphql', 'microservices', 'server', 'backend', 'middleware',
    'queue', 'worker', 'websocket'
  ],

  'Inteligencia Artificial y Machine Learning': [
    'ai', 'inteligencia artificial', 'machine learning', 'ml', 'deep learning',
    'nlp', 'openai', 'chatgpt', 'claude', 'llm', 'gpt', 'bert', 'transformer',
    'stable diffusion', 'midjourney', 'computer vision', 'generative ai',
    'prompt engineering', 'neural network', 'tensorflow', 'pytorch',
    'keras', 'huggingface', 'vector db', 'embedding', 'rag',
    'agentic ai', 'autonomous agent', 'langchain'
  ],

  'Ciberseguridad': [
    'cybersecurity', 'hacking', 'ethical hacking', 'pentesting', 'red team',
    'blue team', 'malware', 'ransomware', 'phishing', 'owasp', 'exploit',
    'firewall', 'encryption', 'ssl', 'tls', 'ddos', 'vpn', 'bug bounty',
    'zeroday', 'osint', 'forensics', 'infosec', 'ciberseguridad',
    'security', 'authentication', 'authorization', 'xss', 'csrf', 'mitre'
  ],

  'DevOps y Cloud': [
    'devops', 'cloud', 'aws', 'gcp', 'azure', 'digitalocean', 'vercel', 'netlify',
    'docker', 'kubernetes', 'helm', 'terraform', 'ansible', 'pulumi',
    'ci/cd', 'jenkins', 'github actions', 'gitlab ci', 'argo',
    'monitoring', 'grafana', 'prometheus', 'observability',
    'logging', 'scalability', 'infrastructure', 'load balancing'
  ],

  'Bases de Datos': [
    'database', 'sql', 'mysql', 'postgres', 'postgresql', 'mariadb', 'oracle',
    'sqlserver', 'mongodb', 'nosql', 'redis', 'elasticsearch', 'cassandra',
    'bigquery', 'firestore', 'dynamodb', 'supabase', 'neon', 'cockroachdb',
    'prisma', 'typeorm', 'sequelize', 'drizzle',
    'data modeling', 'query', 'indexing', 'sharding', 'etl'
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
    'stable', 'deprecated', 'support ended', 'feature', 'bugfix', 'performance',
    'changelog', 'rc', 'milestone'
  ],
  'Noticias Generales': [
    'noticia', 'noticias', 'breaking', 'news', 'última hora', 'actualidad',
    'informe', 'reportaje', 'report', 'announces', 'confirmed', 'official',
    'press', 'statement', 'headline'
  ],
  'Política y Gobierno': [
    'política', 'gobierno', 'parlamento', 'elecciones', 'election', 'referéndum',
    'presidente', 'ministro', 'ley', 'policy', 'senado', 'diputados',
    'manifestación', 'protesta', 'congreso', 'campaña electoral', 'gubernamental'
  ],
  'Economía y Mercados': [
    'economía', 'mercados', 'bolsa', 'acciones', 'inflación', 'crisis',
    'impuestos', 'banco central', 'intereses', 'mercado financiero',
    'subida precios', 'crypto', 'bitcoin', 'ethereum', 'nasdaq', 'dow jones',
    'euribor', 'mercado', 'divisas', 'recesión', 'fmi', 'fed'
  ],
  'Eventos y Sucesos': [
    'evento', 'breaking news', 'tragedia', 'accidente', 'catástrofe',
    'desastre', 'sismo', 'terremoto', 'huracán', 'alerta', 'incendio',
    'suceso', 'urgente', 'emergencia', 'tsunami', 'inundación', 'dana'
  ],
  'Ciencia y Salud': [
    'salud', 'vacunas', 'pandemia', 'covid', 'investigación', 'ciencia',
    'hospital', 'enfermedad', 'tratamiento', 'descubrimiento', 'virus',
    'salud pública', 'oms', 'medicina', 'farmacéutica', 'biotecnología',
    'genética', 'neurociencia'
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
  // 💡 DESARROLLO PERSONAL
  // ────────────────────────────────
  'Frases Motivacionales': [
    'motivación', 'inspiración', 'cita', 'frase', 'quote', 'sabiduría',
    'mindset', 'crecimiento personal', 'superación', 'perseverancia',
    'determinación', 'resiliencia'
  ],
  'Éxito y Productividad': [
    'productividad', 'éxito', 'disciplina', 'organización', 'planificación',
    'eficiencia', 'gestión del tiempo', 'logro', 'objetivos', 'progreso',
    'time management', 'foco'
  ],
  'Desarrollo Personal': [
    'crecimiento', 'autoestima', 'desarrollo personal', 'mentalidad',
    'propósito', 'liderazgo', 'mental health', 'bienestar emocional',
    'coaching', 'psicología', 'mindfulness'
  ],

  // ────────────────────────────────
  // 🎭 CULTURA POP
  // ────────────────────────────────
  'Cine y Series': [
    'película', 'movie', 'film', 'serie', 'netflix', 'hbo', 'prime video',
    'disney+', 'apple tv', 'estreno', 'tráiler', 'spoiler', 'actor',
    'actriz', 'director', 'oscar', 'premios', 'festival cine'
  ],
  'Música y Conciertos': [
    'música', 'spotify', 'apple music', 'tidal', 'concierto', 'álbum',
    'single', 'canción', 'tour', 'festival', 'banda', 'dj', 'cantante',
    'singer', 'billboard', 'grammy'
  ],
  'Gaming y Esports': [
    'gaming', 'videojuegos', 'esports', 'twitch', 'streaming', 'steam',
    'ps5', 'xbox', 'nintendo', 'league of legends', 'fortnite', 'valorant',
    'csgo', 'dota', 'roblox', 'minecraft'
  ],
  'Memes y Cultura Internet': [
    'meme', 'memes', 'funny', 'viral', 'trend', 'shitpost', 'parodia',
    'tiktok', 'youtube', 'instagram', 'reels', 'humor', 'challenge',
    'threads', 'reddit'
  ],

  // ────────────────────────────────
  // ⚽ DEPORTES
  // ────────────────────────────────
  'Fútbol': [
    'fútbol', 'football', 'soccer', 'champions', 'laliga', 'premier league',
    'liga mx', 'balón de oro', 'cristiano', 'messi', 'gol', 'penalti', 'var',
    'entrenador', 'mundial', 'uefa'
  ],
  'Baloncesto y Otros Deportes': [
    'baloncesto', 'nba', 'basket', 'tenis', 'f1', 'formula 1', 'motogp',
    'rugby', 'boxeo', 'natación', 'voleibol', 'atletismo', 'olimpiadas',
    'wimbledon', 'super bowl'
  ],
  'Fitness y Salud': [
    'gym', 'fitness', 'entrenamiento', 'workout', 'crossfit', 'rutina',
    'dieta', 'nutrición', 'salud física', 'pesas', 'cardio', 'wellness',
    'personal trainer'
  ],

  // ────────────────────────────────
  // 💼 NEGOCIOS
  // ────────────────────────────────
  'Negocios y Startups': [
    'negocio', 'empresa', 'startup', 'emprendimiento', 'innovación',
    'escala', 'fundador', 'inversores', 'modelo de negocio', 'pymes',
    'saas', 'venture capital', 'growth'
  ],
  'Inversiones y Finanzas': [
    'inversión', 'bolsa', 'acciones', 'criptomonedas', 'trading',
    'broker', 'nasdaq', 'finanzas', 'deuda', 'fondos', 'patrimonio',
    'divisas', 'mercado financiero', 'blockchain', 'tokenomics'
  ],
  'Marketing y Ventas': [
    'marketing', 'publicidad', 'ventas', 'clientes', 'branding',
    'posicionamiento', 'estrategia digital', 'seo', 'sem',
    'community manager', 'campaña', 'crecimiento', 'influencer marketing'
  ],
  'Liderazgo y Gestión': [
    'liderazgo', 'management', 'gestión de equipos', 'dirección',
    'plan estratégico', 'reclutamiento', 'recursos humanos',
    'coaching empresarial', 'cultura organizacional', 'agile', 'scrum'
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
    const { pipeline } = await import('@huggingface/transformers');
    
    // Usar el modelo original con configuración mínima
    sentimentPipeline = await pipeline(
      'zero-shot-classification',
      'MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7',
    );
    
    transformersLoaded = true;
    logger.info('✅ Modelo de análisis de sentimientos inicializado correctamente');

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
    
    // Método 1: Categorización por palabras clave
    const keywordResults = categorizeByKeywords(normalizedContent);
    
    // Método 2: Si Transformers.js está disponible, usarlo
    let aiResults = [];
    if (transformersLoaded && sentimentPipeline) {
      try {
        aiResults = await categorizeWithAI(content);
      } catch (error) {
        logger.warn('Error usando IA, fallback a keywords:', error.message);
      }
    }

    // Método 3: Análisis de contexto adicional
    const contextResults = categorizeByContext(normalizedContent);
    
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
 * Categorización usando IA (RoBERTuito)
 */
async function categorizeWithAI(content) {
  try {
    if (!sentimentPipeline) {
      return [];
    }

    // Modelo de análisis de sentimientos - adaptamos para categorización
    const result = await sentimentPipeline(content);
    
    // Mapear sentimientos a categorías más amplias
    const sentimentToCategory = {
      'POSITIVE': 'Contenido Positivo',
      'NEGATIVE': 'Contenido Negativo'
    };

    const category = sentimentToCategory[result[0]?.label] || 'General';
    const confidence = result[0]?.score || 0.5;

    return [{
      category,
      confidence: Math.max(confidence, 0.3),
      method: 'ai',
      details: { 
        originalLabel: result[0]?.label,
        originalScore: result[0]?.score 
      }
    }];

  } catch (error) {
    logger.warn('Error en categorización con IA:', error.message);
    return [];
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
 * Categorización por contexto
 */
function categorizeByContext(content) {
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
  return withPrisma(async (prisma) => {
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

    // Guardar todas las categorías del tweet
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
  }, 'recategorize_single_tweet');
}

/**
 * Recategorizar todos los tweets de un usuario usando IA
 */
export async function recategorizeAllTweets(userId) {
  return withPrisma(async (prisma) => {
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
  }, 'recategorize_all_tweets');
}

/**
 * Guardar categorías de un tweet en la base de datos
 */
export async function saveTweetCategories(tweetId, categories, userId) {
  return withPrisma(async (prisma) => {
    const hasTweetCategoryTable = await checkTweetCategoryTableExists(prisma);
    
    if (hasTweetCategoryTable) {
      // Usar la nueva tabla de relación many-to-many
      await saveTweetCategoriesWithTable(tweetId, categories, userId, prisma);
    } else {
      // Fallback al campo legacy category
      await saveTweetCategoriesLegacy(tweetId, categories, userId, prisma);
    }

    logger.info(`Categorías guardadas para tweet ${tweetId}:`, {
      categories: categories.map(cat => `${cat.category} (${cat.confidence})`),
      method: hasTweetCategoryTable ? 'table' : 'legacy'
    });
  }, 'save_tweet_categories');
}

/**
 * Guardar categorías usando la tabla TweetCategory
 */
async function saveTweetCategoriesWithTable(tweetId, categories, userId, prisma) {
  // Eliminar categorías existentes del tweet
  await prisma.tweetCategory.deleteMany({
    where: { tweetId }
  });

  // Guardar nuevas categorías
  for (const cat of categories) {
    const category = await findOrCreateCategory(cat.category, userId, prisma);

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
}

/**
 * Guardar categorías usando el campo legacy (fallback)
 */
async function saveTweetCategoriesLegacy(tweetId, categories, userId, prisma) {
  const primaryCategory = categories.find(cat => cat.isPrimary) || categories[0];
  
  if (primaryCategory) {
    const category = await findOrCreateCategory(primaryCategory.category, userId, prisma);

    // Actualizar solo la categoría principal en el campo legacy
    await prisma.tweet.update({
      where: { id: tweetId },
      data: { 
        category: primaryCategory.category,
        confidenceScore: primaryCategory.confidence
      }
    });
  }
}

/**
 * Obtener categorías de un tweet desde la base de datos
 */
export async function getTweetCategories(tweetId) {
  return withPrisma(async (prisma) => {
    const hasTweetCategoryTable = await checkTweetCategoryTableExists(prisma);
    
    if (hasTweetCategoryTable) {
      return await getTweetCategoriesWithTable(tweetId, prisma);
    } else {
      return await getTweetCategoriesLegacy(tweetId, prisma);
    }
  }, 'get_tweet_categories');
}

/**
 * Obtener categorías usando la tabla TweetCategory
 */
async function getTweetCategoriesWithTable(tweetId, prisma) {
  const tweetCategories = await prisma.tweetCategory.findMany({
    where: { tweetId },
    include: { category: true },
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
}

/**
 * Obtener categorías usando el campo legacy (fallback)
 */
async function getTweetCategoriesLegacy(tweetId, prisma) {
  const tweet = await prisma.tweet.findUnique({
    where: { id: tweetId },
    select: { category: true, confidenceScore: true }
  });

  if (!tweet || !tweet.category) {
    return [];
  }

  const category = await prisma.category.findFirst({
    where: { name: tweet.category }
  });

  if (!category) {
    return [];
  }

  return [{
    id: category.id,
    name: category.name,
    color: category.color,
    confidence: tweet.confidenceScore || 0.5,
    isPrimary: true
  }];
}

/**
 * Actualizar conteo de tweets por categoría
 */
export async function updateCategoryTweetCounts(userId) {
  return withPrisma(async (prisma) => {
    const hasTweetCategoryTable = await checkTweetCategoryTableExists(prisma);
    
    // Obtener todas las categorías del usuario
    const categories = await prisma.category.findMany({
      where: { userId }
    });

    // Actualizar conteo para cada categoría
    for (const category of categories) {
      let count = 0;
      
      if (hasTweetCategoryTable) {
        count = await prisma.tweetCategory.count({
          where: {
            categoryId: category.id,
            tweet: { isArchived: false }
          }
        });
      } else {
        count = await prisma.tweet.count({
          where: {
            category: category.name,
            userId,
            isArchived: false
          }
        });
      }

      await prisma.category.update({
        where: { id: category.id },
        data: { tweetCount: count }
      });
    }

    logger.info(`Conteos de tweets actualizados para usuario ${userId}`, {
      method: hasTweetCategoryTable ? 'table' : 'legacy'
    });
  }, 'update_category_tweet_counts');
}

/**
 * Categorizar solo tweets que no tienen categoría asignada
 */
export async function categorizeUncategorizedTweets(userId) {
  return withPrisma(async (prisma) => {
    // Obtener tweets sin categoría del usuario
    const uncategorizedTweets = await prisma.tweet.findMany({
      where: {
        userId,
        isArchived: false,
        OR: [
          { category: null },
          { category: '' },
          { category: 'General' }
        ]
      },
      select: { id: true, content: true, category: true },
      orderBy: { bookmarkedAt: 'desc' }
    });

    const found = uncategorizedTweets.length;
    logger.info(`Encontrados ${found} tweets sin categoría para usuario ${userId}`);

    if (found === 0) {
      return { found: 0, categorized: 0, processed: 0 };
    }

    let categorized = 0;
    let processed = 0;

    // Procesar tweets en lotes de 10 para evitar sobrecarga
    const batchSize = 10;
    for (let i = 0; i < uncategorizedTweets.length; i += batchSize) {
      const batch = uncategorizedTweets.slice(i, i + batchSize);
      
      for (const tweet of batch) {
        try {
          processed++;
          
          // Categorizar el tweet usando IA
          const result = await categorizeTweet(tweet.content, userId);
          
          if (result.categories && result.categories.length > 0) {
            // Obtener la categoría principal
            const primaryCategory = result.categories.find(cat => cat.isPrimary) || result.categories[0];
            
            // Actualizar la categoría del tweet
            await prisma.tweet.update({
              where: { id: tweet.id },
              data: { category: primaryCategory.category }
            });

            // Guardar todas las categorías del tweet
            await saveTweetCategories(tweet.id, result.categories, userId);
            
            categorized++;
            
            logger.info(`Tweet ${tweet.id} categorizado: ${tweet.category} -> ${primaryCategory.category}`);
          }
        } catch (error) {
          logger.error(`Error categorizando tweet ${tweet.id}:`, error);
          // Continuar con el siguiente tweet en caso de error
        }
      }
      
      // Pequeña pausa entre lotes para no sobrecargar el sistema
      if (i + batchSize < uncategorizedTweets.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Actualizar conteos de categorías
    await updateCategoryTweetCounts(userId);

    logger.info(`Categorización de tweets sin categoría completada para usuario ${userId}:`, {
      found,
      categorized,
      processed
    });

    return { found, categorized, processed };
  });
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
  categorizeUncategorizedTweets,
  saveTweetCategories,
  getTweetCategories,
  updateCategoryTweetCounts
};