import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { logger, logTwitterAPI, logSync, logError } from '../utils/logger.js';
import { categorizeTweet, saveTweetCategories } from './categorizationService.js';
import { TwitterAPIError, AppError } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

class TwitterService {
  constructor() {
    this.baseURL = 'https://api.twitter.com/2';
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 segundo
    this.rateLimitDelay = 10000; // 10 segundos entre requests para evitar rate limits
    this.apiKey = process.env.TWITTER_API_KEY;
    this.apiSecret = process.env.TWITTER_API_SECRET;
    this.bearerToken = process.env.TWITTER_BEARER_TOKEN;
  }

  // Crear cliente HTTP con interceptores
  createHTTPClient(accessToken = null, useAppAuth = false) {
    let authHeader;
    
    if (accessToken) {
      // User authentication - OAuth 2.0 Bearer Token del usuario
      authHeader = `Bearer ${accessToken}`;
    } else if (useAppAuth && this.bearerToken) {
      // App-only authentication con Bearer Token
      authHeader = `Bearer ${this.bearerToken}`;
    } else if (useAppAuth && this.apiKey && this.apiSecret) {
      // App-only authentication with API Key + Secret (menos común)
      const credentials = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');
      authHeader = `Basic ${credentials}`;
    } else {
      throw new TwitterAPIError('No hay credenciales válidas disponibles', 401);
    }

    console.log('authHeader', authHeader.substring(0, 20) + '...');

    const client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 segundos
    });

    // Interceptor para logging de requests
    client.interceptors.request.use(
      (config) => {
        logTwitterAPI('REQUEST', {
          method: config.method,
          url: config.url,
          params: config.params,
          authType: accessToken ? 'user' : 'app'
        });
        return config;
      },
      (error) => {
        logError(error, { context: 'twitter_request_interceptor' });
        return Promise.reject(error);
      }
    );

    // Interceptor para manejo de respuestas y errores
    client.interceptors.response.use(
      (response) => {
        logTwitterAPI('RESPONSE_SUCCESS', {
          status: response.status,
          url: response.config.url,
          rateLimit: {
            limit: response.headers['x-rate-limit-limit'],
            remaining: response.headers['x-rate-limit-remaining'],
            reset: response.headers['x-rate-limit-reset']
          }
        });
        return response;
      },
      (error) => {
        const twitterError = this.handleTwitterError(error);
        logTwitterAPI('RESPONSE_ERROR', {
          status: error.response?.status,
          message: error.response?.data?.detail || error.message,
          url: error.config?.url
        });
        return Promise.reject(twitterError);
      }
    );

    return client;
  }

  // Manejo específico de errores de Twitter API
  handleTwitterError(error) {
    if (!error.response) {
      return new TwitterAPIError('Error de conexión con Twitter API', 503);
    }

    const { status, data } = error.response;
    const rateLimit = {
      limit: error.response.headers['x-rate-limit-limit'],
      remaining: error.response.headers['x-rate-limit-remaining'],
      reset: error.response.headers['x-rate-limit-reset']
    };

    switch (status) {
      case 401:
        return new TwitterAPIError('Token de Twitter inválido o expirado', 401, 'INVALID_TOKEN');
      case 403:
        return new TwitterAPIError('Acceso denegado por Twitter - Verifique permisos y tipo de autenticación', 403, 'FORBIDDEN');
      case 429:
        return new TwitterAPIError('Rate limit excedido', 429, 'RATE_LIMIT', rateLimit);
      case 500:
      case 502:
      case 503:
        return new TwitterAPIError('Error interno de Twitter', status, 'TWITTER_SERVER_ERROR');
      default:
        return new TwitterAPIError(
          data?.detail || 'Error desconocido de Twitter API',
          status,
          data?.type
        );
    }
  }

  // Método para manejar rate limits con retry automático
  async handleRateLimitWithRetry(apiCall, maxRetries = 5) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;
        
        if (error.status === 429) {
          // Rate limit excedido
          const resetTime = error.rateLimit?.reset;
          let waitTime;
          
          if (resetTime) {
            // Calcular tiempo de espera hasta el reset
            const resetTimestamp = parseInt(resetTime) * 1000; // Convertir a milisegundos
            const now = Date.now();
            waitTime = Math.max(60000, resetTimestamp - now + 5000); // +5 segundos de margen
            
            logTwitterAPI('RATE_LIMIT_RETRY', {
              attempt,
              maxRetries,
              waitTime: `${waitTime}ms`,
              resetTime: new Date(resetTimestamp).toISOString(),
              currentTime: new Date(now).toISOString(),
              remaining: error.rateLimit?.remaining || 'unknown',
              limit: error.rateLimit?.limit || 'unknown'
            });
          } else {
            // Si no hay reset time, usar backoff exponencial
            waitTime = Math.min(300000, 10000 * Math.pow(2, attempt - 1)); // Máximo 5 minutos
            
            logTwitterAPI('RATE_LIMIT_RETRY', {
              attempt,
              maxRetries,
              waitTime: `${waitTime}ms`,
              resetTime: 'unknown',
              strategy: 'exponential_backoff'
            });
          }
          
          if (attempt < maxRetries) {
            logTwitterAPI('RATE_LIMIT_WAITING', {
              message: `Esperando ${Math.round(waitTime / 1000)} segundos antes del reintento ${attempt + 1}/${maxRetries}`
            });
            
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        
        // Si no es rate limit o se agotaron los reintentos, lanzar error
        throw error;
      }
    }
    
    throw lastError;
  }

  // Obtener bookmarks del usuario
  async getBookmarks(accessToken, userId, paginationToken = null, maxResults = 100) {
    if (!accessToken) {
      throw new TwitterAPIError('Se requiere token de acceso del usuario para obtener bookmarks', 401);
    }

    const client = this.createHTTPClient(accessToken);

    const params = {
      max_results: Math.min(maxResults, 25), // Reducir aún más el tamaño de lote
      'tweet.fields': 'id,text,author_id,created_at,public_metrics,context_annotations',
      'user.fields': 'id,name,username',
      expansions: 'author_id,attachments.media_keys',
      'media.fields': 'type,url,preview_image_url'
    };

    if (paginationToken) {
      params.pagination_token = paginationToken;
    }

    try {
      // Usar el manejo de rate limits con retry
      const response = await this.handleRateLimitWithRetry(async () => {
        logTwitterAPI('BOOKMARKS_REQUEST', {
          userId,
          maxResults: params.max_results,
          hasPaginationToken: !!paginationToken
        });
        
        return await client.get('/users/me/bookmarks', { params });
      });
      
      const data = response.data;

      // Procesar tweets
      const tweets = data.data || [];
      const users = data.includes?.users || [];
      const media = data.includes?.media || [];

      // Mapear usuarios por ID para búsqueda rápida
      const userMap = {};
      users.forEach(user => {
        userMap[user.id] = user;
      });

      // Mapear media por key
      const mediaMap = {};
      media.forEach(m => {
        mediaMap[m.media_key] = m;
      });

      // Procesar y enriquecer tweets
      const processedTweets = tweets.map(tweet => {
        const author = userMap[tweet.author_id] || {};
        const tweetMedia = tweet.attachments?.media_keys?.map(key => mediaMap[key]) || [];

        return {
          tweetId: tweet.id,
          content: tweet.text,
          authorId: tweet.author_id,
          authorUsername: author.username || 'unknown',
          authorName: author.name || 'Unknown User',
          createdAtTwitter: new Date(tweet.created_at),
          bookmarkedAt: new Date(), // Twitter no proporciona fecha de bookmark
          retweetCount: tweet.public_metrics?.retweet_count || 0,
          likeCount: tweet.public_metrics?.like_count || 0,
          replyCount: tweet.public_metrics?.reply_count || 0,
          mediaUrls: tweetMedia.length > 0 ? JSON.stringify(tweetMedia.map(m => m.url || m.preview_image_url)) : null,
          hashtags: this.extractHashtags(tweet.text),
          mentions: this.extractMentions(tweet.text),
          userId
        };
      });

      return {
        tweets: processedTweets,
        nextToken: data.meta?.next_token || null,
        resultCount: data.meta?.result_count || 0
      };

    } catch (error) {
      if (error.isTwitterError) {
        throw error;
      }
      throw new TwitterAPIError('Error obteniendo bookmarks', 500);
    }
  }

  // Extraer hashtags del texto
  extractHashtags(text) {
    const hashtags = text.match(/#[\w\u00c0-\u024f\u1e00-\u1eff]+/g) || [];
    return hashtags.length > 0 ? JSON.stringify(hashtags) : null;
  }

  // Extraer menciones del texto
  extractMentions(text) {
    const mentions = text.match(/@[\w\u00c0-\u024f\u1e00-\u1eff]+/g) || [];
    return mentions.length > 0 ? JSON.stringify(mentions) : null;
  }

  // Sincronizar todos los bookmarks de un usuario
  async syncUserBookmarks(userId) {
    const startTime = Date.now();
    let totalTweets = 0;
    let newTweets = 0;
    let paginationToken = null;
    let allTweets = [];
    let syncLog = null; // Declarar syncLog fuera del try para que esté disponible en el catch

    try {
      // Obtener usuario y su token
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, accessToken: true, username: true }
      });

      if (!user || !user.accessToken) {
        throw new AppError('Usuario no encontrado o sin token de acceso', 404);
      }

      logSync(userId, 'SYNC_START', { username: user.username });

      // Crear log de sincronización
      syncLog = await prisma.syncLog.create({
        data: {
          userId,
          status: 'running',
          startedAt: new Date()
        }
      });

      console.log('syncLog', syncLog);

      // Obtener todos los bookmarks con paginación
      do {
        const result = await this.getBookmarks(
          user.accessToken,
          userId,
          paginationToken,
          25 // Lotes muy pequeños para evitar rate limits
        );

        allTweets = allTweets.concat(result.tweets);
        totalTweets += result.resultCount;
        paginationToken = result.nextToken;

        logSync(userId, 'SYNC_BATCH', {
          batchSize: result.resultCount,
          totalSoFar: allTweets.length,
          hasNext: !!paginationToken
        });

        // Pausa más larga entre requests para evitar rate limits
        if (paginationToken) {
          logSync(userId, 'SYNC_PAUSE', {
            message: `Esperando ${this.rateLimitDelay}ms antes del siguiente lote...`
          });
          await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
        }

      } while (paginationToken);

      // Guardar tweets en la base de datos con categorización automática
      for (const tweetData of allTweets) {
        try {
          // Categorizar el tweet automáticamente si no tiene categoría
          let category = tweetData.category || 'General';
          let categories = [];
          
          if (!tweetData.category && tweetData.content) {
            try {
              const categorizationResult = await categorizeTweet(tweetData.content, userId);
              categories = categorizationResult.categories;
              category = categories.find(cat => cat.isPrimary)?.category || categories[0]?.category || 'General';
              logger.debug(`Tweet categorizado automáticamente: ${categories.map(cat => cat.category).join(', ')}`);
            } catch (error) {
              logger.warn('Error en categorización automática:', error.message);
              // Continuar con categoría por defecto
              categories = [{ category: 'General', confidence: 0.3, isPrimary: true }];
            }
          } else {
            // Si ya tiene categoría, crear estructura para múltiples categorías
            categories = [{ category, confidence: 0.8, isPrimary: true }];
          }

          const tweetToSave = {
            ...tweetData,
            category
          };

          const tweet = await prisma.tweet.upsert({
            where: { tweetId: tweetData.tweetId },
            update: {
              // Solo actualizar metadatos, no el contenido
              retweetCount: tweetData.retweetCount,
              likeCount: tweetData.likeCount,
              replyCount: tweetData.replyCount
            },
            create: tweetToSave
          });

          // Guardar categorías múltiples si es un tweet nuevo
          if (categories.length > 0) {
            try {
              await saveTweetCategories(tweet.id, categories, userId);
            } catch (error) {
              logger.warn('Error guardando categorías múltiples:', error.message);
            }
          }

          newTweets++;
        } catch (error) {
          if (error.code === 'P2002') {
            // Tweet duplicado, continuar
            continue;
          }
          throw error;
        }
      }

      // Actualizar última sincronización del usuario
      await prisma.user.update({
        where: { id: userId },
        data: { lastSync: new Date() }
      });

      // Completar log de sincronización
      const duration = Date.now() - startTime;
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'success',
          tweetsFound: totalTweets,
          tweetsNew: newTweets,
          duration,
          completedAt: new Date()
        }
      });

      logSync(userId, 'SYNC_COMPLETE', {
        totalTweets,
        newTweets,
        duration: `${duration}ms`
      });

      return {
        success: true,
        totalTweets,
        newTweets,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log de error en la sincronización
      if (syncLog) {
        await prisma.syncLog.update({
          where: { id: syncLog.id },
          data: {
            status: 'error',
            error: error.message,
            duration,
            completedAt: new Date()
          }
        });
      }

      logSync(userId, 'SYNC_ERROR', {
        error: error.message,
        totalTweets,
        newTweets,
        duration: `${duration}ms`
      });

      throw error;
    }
  }

  // Obtener información del usuario actual de Twitter
  async getCurrentUser(accessToken) {
    if (!accessToken) {
      throw new TwitterAPIError('Se requiere token de acceso del usuario', 401, 'MISSING_ACCESS_TOKEN');
    }

    console.log('Using user accessToken for /users/me');
    
    try {
      // IMPORTANTE: /users/me REQUIERE autenticación de usuario
      const client = this.createHTTPClient(accessToken); // Usar el accessToken del usuario
      
      const response = await client.get('/users/me', {
        params: {
          'user.fields': 'id,name,username,profile_image_url,public_metrics'
        }
      });

      return response.data.data;
      
    } catch (error) {
      console.log('getCurrentUser error:', error.message);
      
      if (error.isTwitterError) {
        // Si es error 401/403, el token del usuario probablemente está expirado
        if (error.status === 401 || error.status === 403) {
          throw new TwitterAPIError(
            'Token de usuario inválido o expirado. El usuario debe reautorizar la aplicación.',
            error.status,
            'INVALID_USER_TOKEN'
          );
        }
        throw error;
      }
      
      throw new TwitterAPIError('Error obteniendo información del usuario', 500);
    }
  }

  // Método alternativo para obtener información de usuario por ID (usa app auth)
  async getUserById(userId, accessToken = null) {
    try {
      // Primero intentar con token de usuario si está disponible
      const client = accessToken ? 
        this.createHTTPClient(accessToken) : 
        this.createHTTPClient(null, true); // Usar app auth
      
      const response = await client.get(`/users/${userId}`, {
        params: {
          'user.fields': 'id,name,username,profile_image_url,public_metrics'
        }
      });

      return response.data.data;
      
    } catch (error) {
      if (error.isTwitterError) {
        throw error;
      }
      throw new TwitterAPIError('Error obteniendo información del usuario por ID', 500);
    }
  }
}

// Exportar instancia singleton
const twitterService = new TwitterService();

// Funciones de conveniencia
export const getBookmarks = (accessToken, userId, paginationToken, maxResults) =>
  twitterService.getBookmarks(accessToken, userId, paginationToken, maxResults);

export const syncUserBookmarks = (userId) =>
  twitterService.syncUserBookmarks(userId);

export const getCurrentUser = (accessToken) =>
  twitterService.getCurrentUser(accessToken);

export const getUserById = (userId, accessToken) =>
  twitterService.getUserById(userId, accessToken);

export default twitterService;