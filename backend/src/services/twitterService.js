import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { logger, logTwitterAPI, logSync, logError } from '../utils/logger.js';
import { TwitterAPIError, AppError } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

class TwitterService {
  constructor() {
    // Cambiar a API v1.1 para aplicaciones standalone
    this.baseURL = 'https://api.twitter.com/1.1';
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 segundo
    this.apiKey = process.env.TWITTER_API_KEY;
    this.apiSecret = process.env.TWITTER_API_SECRET;
    this.bearerToken = process.env.TWITTER_BEARER_TOKEN;
  }

  // Crear cliente HTTP con interceptores para API v1.1
  createHTTPClient(accessToken = null, useAppAuth = false) {
    let authHeader;
    
    if (accessToken) {
      // User authentication - OAuth 1.0a para v1.1
      // Para v1.1 necesitamos OAuth 1.0a, no Bearer token
      throw new TwitterAPIError('API v1.1 requiere OAuth 1.0a para autenticación de usuario', 401);
    } else if (useAppAuth && this.bearerToken) {
      // App-only authentication con Bearer Token (solo para algunos endpoints)
      authHeader = `Bearer ${this.bearerToken}`;
    } else if (useAppAuth && this.apiKey && this.apiSecret) {
      // App-only authentication with API Key + Secret
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
          message: error.response?.data?.errors?.[0]?.message || error.message,
          url: error.config?.url
        });
        return Promise.reject(twitterError);
      }
    );

    return client;
  }

  // Manejo específico de errores de Twitter API v1.1
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

    // En v1.1, los errores vienen en data.errors array
    const errorMessage = data?.errors?.[0]?.message || 'Error desconocido de Twitter API';
    const errorCode = data?.errors?.[0]?.code;

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
          errorMessage,
          status,
          errorCode
        );
    }
  }

  // Obtener favoritos del usuario (equivalente a bookmarks en v1.1)
  async getFavorites(accessToken, userId, maxId = null, count = 100) {
    if (!accessToken) {
      throw new TwitterAPIError('Se requiere token de acceso del usuario para obtener favoritos', 401);
    }

    // Para v1.1 necesitamos OAuth 1.0a, no Bearer token
    // Esto requiere una implementación más compleja con OAuth 1.0a
    throw new TwitterAPIError('API v1.1 requiere implementación de OAuth 1.0a para favoritos', 501);
  }

  // Obtener timeline del usuario (alternativa a bookmarks)
  async getUserTimeline(userId, screenName = null, maxId = null, count = 100) {
    try {
      const client = this.createHTTPClient(null, true); // Usar app auth

      const params = {
        count: Math.min(count, 200), // v1.1 límite máximo
        include_entities: true,
        tweet_mode: 'extended' // Para obtener texto completo
      };

      if (maxId) {
        params.max_id = maxId;
      }

      if (screenName) {
        params.screen_name = screenName;
      } else if (userId) {
        params.user_id = userId;
      }

      const response = await client.get('/statuses/user_timeline.json', { params });
      const tweets = response.data;

      // Procesar tweets del formato v1.1
      const processedTweets = tweets.map(tweet => {
        return {
          tweetId: tweet.id_str,
          content: tweet.full_text || tweet.text,
          authorId: tweet.user.id_str,
          authorUsername: tweet.user.screen_name,
          authorName: tweet.user.name,
          createdAtTwitter: new Date(tweet.created_at),
          bookmarkedAt: new Date(), // No tenemos fecha real de bookmark
          retweetCount: tweet.retweet_count || 0,
          likeCount: tweet.favorite_count || 0,
          replyCount: 0, // No disponible en v1.1
          mediaUrls: tweet.entities?.media ? JSON.stringify(tweet.entities.media.map(m => m.media_url_https)) : null,
          hashtags: this.extractHashtags(tweet.full_text || tweet.text),
          mentions: this.extractMentions(tweet.full_text || tweet.text),
          userId
        };
      });

      return {
        tweets: processedTweets,
        nextMaxId: tweets.length > 0 ? tweets[tweets.length - 1].id_str : null,
        resultCount: tweets.length
      };

    } catch (error) {
      if (error.isTwitterError) {
        throw error;
      }
      throw new TwitterAPIError('Error obteniendo timeline del usuario', 500);
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

  // Sincronizar timeline del usuario (alternativa a bookmarks)
  async syncUserTimeline(userId, screenName = null) {
    const startTime = Date.now();
    let totalTweets = 0;
    let newTweets = 0;
    let maxId = null;
    let allTweets = [];

    try {
      // Obtener usuario
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true }
      });

      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      logSync(userId, 'SYNC_START', { username: user.username });

      // Crear log de sincronización
      const syncLog = await prisma.syncLog.create({
        data: {
          userId,
          status: 'running',
          startedAt: new Date()
        }
      });

      // Obtener timeline con paginación
      do {
        const result = await this.getUserTimeline(
          userId,
          screenName || user.username,
          maxId,
          200
        );

        allTweets = allTweets.concat(result.tweets);
        totalTweets += result.resultCount;
        maxId = result.nextMaxId;

        logSync(userId, 'SYNC_BATCH', {
          batchSize: result.resultCount,
          totalSoFar: allTweets.length,
          hasNext: !!maxId
        });

        // Pausa entre requests para evitar rate limits
        if (maxId) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } while (maxId && allTweets.length < 1000); // Límite de 1000 tweets por sincronización

      // Guardar tweets en la base de datos
      for (const tweetData of allTweets) {
        try {
          await prisma.tweet.upsert({
            where: { tweetId: tweetData.tweetId },
            update: {
              // Solo actualizar metadatos, no el contenido
              retweetCount: tweetData.retweetCount,
              likeCount: tweetData.likeCount,
              replyCount: tweetData.replyCount
            },
            create: tweetData
          });
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

  // Obtener información del usuario por screen_name (v1.1)
  async getUserByScreenName(screenName) {
    try {
      const client = this.createHTTPClient(null, true); // Usar app auth
      
      const response = await client.get('/users/show.json', {
        params: {
          screen_name: screenName,
          include_entities: false
        }
      });

      const user = response.data;
      
      return {
        id: user.id_str,
        name: user.name,
        username: user.screen_name,
        profileImageUrl: user.profile_image_url_https,
        followersCount: user.followers_count,
        friendsCount: user.friends_count,
        statusesCount: user.statuses_count
      };
      
    } catch (error) {
      if (error.isTwitterError) {
        throw error;
      }
      throw new TwitterAPIError('Error obteniendo información del usuario', 500);
    }
  }

  // Obtener información del usuario por ID (v1.1)
  async getUserById(userId) {
    try {
      const client = this.createHTTPClient(null, true); // Usar app auth
      
      const response = await client.get('/users/show.json', {
        params: {
          user_id: userId,
          include_entities: false
        }
      });

      const user = response.data;
      
      return {
        id: user.id_str,
        name: user.name,
        username: user.screen_name,
        profileImageUrl: user.profile_image_url_https,
        followersCount: user.followers_count,
        friendsCount: user.friends_count,
        statusesCount: user.statuses_count
      };
      
    } catch (error) {
      if (error.isTwitterError) {
        throw error;
      }
      throw new TwitterAPIError('Error obteniendo información del usuario por ID', 500);
    }
  }

  // Método para verificar si las credenciales son válidas
  async verifyCredentials() {
    try {
      const client = this.createHTTPClient(null, true);
      
      const response = await client.get('/account/verify_credentials.json');
      
      return {
        valid: true,
        user: response.data
      };
      
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

// Exportar instancia singleton
const twitterService = new TwitterService();

// Funciones de conveniencia
export const getUserTimeline = (userId, screenName, maxId, count) =>
  twitterService.getUserTimeline(userId, screenName, maxId, count);

export const syncUserTimeline = (userId, screenName) =>
  twitterService.syncUserTimeline(userId, screenName);

export const getUserByScreenName = (screenName) =>
  twitterService.getUserByScreenName(screenName);

export const getUserById = (userId) =>
  twitterService.getUserById(userId);

export const verifyCredentials = () =>
  twitterService.verifyCredentials();

export default twitterService;