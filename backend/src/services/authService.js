import crypto from 'crypto';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { logger, logAuth, logError } from '../utils/logger.js';
import { generateTokens } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { getCurrentUser } from './twitterService.js';

const prisma = new PrismaClient();

class AuthService {
  constructor() {
    this.clientId = process.env.TWITTER_CLIENT_ID;
    this.clientSecret = process.env.TWITTER_CLIENT_SECRET;
    this.callbackURL = process.env.TWITTER_CALLBACK_URL;
    this.authURL = 'https://twitter.com/i/oauth2/authorize';
    this.tokenURL = 'https://api.twitter.com/2/oauth2/token';
    
    // Validar que las variables de entorno estén configuradas
    if (!this.clientId) {
      throw new Error('TWITTER_CLIENT_ID no está configurado');
    }
    if (!this.clientSecret) {
      throw new Error('TWITTER_CLIENT_SECRET no está configurado');
    }
    if (!this.callbackURL) {
      throw new Error('TWITTER_CALLBACK_URL no está configurado');
    }
  }

  // Generar state y code_verifier para PKCE
  generatePKCEParams() {
    const state = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return {
      state,
      codeVerifier,
      codeChallenge
    };
  }

  // Generar URL de autorización OAuth 2.0
  generateAuthURL(state, codeChallenge) {
    console.log('---------------------------------');
    console.log('clientId', this.clientId);
    console.log('clientSecret', this.clientSecret);
    console.log('callbackURL', this.callbackURL);
    console.log('authURL', this.authURL);
    console.log('tokenURL', this.tokenURL);
    console.log('---------------------------------');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.callbackURL,
      scope: 'tweet.read users.read bookmark.read offline.access',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    const authURL = `${this.authURL}?${params.toString()}`;
    
    logAuth('AUTH_URL_GENERATED', {
      state: state.substring(0, 8) + '...',
      scopes: 'tweet.read users.read bookmark.read offline.access'
    });

    return authURL;
  }

  // Intercambiar código de autorización por tokens
  async exchangeCodeForTokens(code, codeVerifier, state) {
    try {
      const tokenData = {
        grant_type: 'authorization_code',
        client_id: this.clientId,
        code,
        redirect_uri: this.callbackURL,
        code_verifier: codeVerifier
      };

      logAuth('TOKEN_EXCHANGE_START', {
        state: state.substring(0, 8) + '...',
        code: code.substring(0, 8) + '...'
      });

      const response = await axios.post(this.tokenURL, tokenData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        }
      });

      const { 
        access_token,
        refresh_token,
        expires_in,
        token_type,
        scope 
      } = response.data;

      logAuth('TOKEN_EXCHANGE_SUCCESS', {
        tokenType: token_type,
        expiresIn: expires_in,
        scopes: scope
      });

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        tokenType: token_type,
        scope
      };

    } catch (error) {
      logError(error, {
        context: 'token_exchange',
        state: state.substring(0, 8) + '...',
        errorData: error.response?.data
      });

      if (error.response?.status === 400) {
        throw new AppError('Código de autorización inválido o expirado', 400, 'INVALID_AUTH_CODE');
      }

      throw new AppError('Error obteniendo tokens de Twitter', 500, 'TOKEN_EXCHANGE_ERROR');
    }
  }

  // Refrescar token de acceso
  async refreshAccessToken(refreshToken) {
    try {
      const tokenData = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId
      };

      logAuth('TOKEN_REFRESH_START', {
        refreshToken: refreshToken.substring(0, 8) + '...'
      });

      const response = await axios.post(this.tokenURL, tokenData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        }
      });

      const {
        access_token,
        refresh_token,
        expires_in,
        token_type
      } = response.data;

      logAuth('TOKEN_REFRESH_SUCCESS', {
        tokenType: token_type,
        expiresIn: expires_in
      });

      return {
        accessToken: access_token,
        refreshToken: refresh_token || refreshToken, // Usar el nuevo si viene, sino mantener el actual
        expiresIn: expires_in,
        tokenType: token_type
      };

    } catch (error) {
      logError(error, {
        context: 'token_refresh',
        refreshToken: refreshToken.substring(0, 8) + '...',
        errorData: error.response?.data
      });

      throw new AppError('Error refrescando token de acceso', 401, 'TOKEN_REFRESH_ERROR');
    }
  }

  // Crear o actualizar usuario después de autenticación exitosa
  async createOrUpdateUser(tokens) {
    try {
      // Obtener información real del usuario de Twitter API v2
      logAuth('FETCHING_USER_INFO', {
        message: 'Obteniendo información del usuario desde Twitter API v2'
      });

      const twitterUser = await getCurrentUser(tokens.accessToken);
      
      logAuth('USER_INFO_RETRIEVED', {
        twitterId: twitterUser.id,
        username: twitterUser.username,
        displayName: twitterUser.name
      });

      // Crear o actualizar usuario con información real
      const user = await prisma.user.upsert({
        where: {
          twitterId: twitterUser.id
        },
        update: {
          username: twitterUser.username,
          displayName: twitterUser.name,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isActive: true,
          updatedAt: new Date()
        },
        create: {
          twitterId: twitterUser.id,
          username: twitterUser.username,
          displayName: twitterUser.name,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isActive: true
        }
      });

      // Crear categorías por defecto para usuarios nuevos
      if (user.createdAt.getTime() === user.updatedAt.getTime()) {
        await this.createDefaultCategories(user.id);
      }

      logAuth('USER_UPSERT_SUCCESS', {
        userId: user.id,
        twitterId: user.twitterId,
        username: user.username,
        displayName: user.displayName,
        isNew: user.createdAt.getTime() === user.updatedAt.getTime()
      });

      return user;

    } catch (error) {
      logError(error, {
        context: 'create_or_update_user',
        accessToken: tokens.accessToken.substring(0, 8) + '...'
      });

      throw new AppError('Error creando o actualizando usuario', 500, 'USER_CREATION_ERROR');
    }
  }

  // Crear categorías por defecto para nuevos usuarios
  async createDefaultCategories(userId) {
    const defaultCategories = [
      {
        name: 'General',
        description: 'Tweets sin categoría específica',
        color: '#6B7280',
        isDefault: true,
        sortOrder: 0
      },
      {
        name: 'Tecnología',
        description: 'Tweets sobre tecnología, programación, etc.',
        color: '#3B82F6',
        isDefault: false,
        sortOrder: 1
      },
      {
        name: 'Noticias',
        description: 'Noticias y actualidad',
        color: '#EF4444',
        isDefault: false,
        sortOrder: 2
      },
      {
        name: 'Educación',
        description: 'Contenido educativo y aprendizaje',
        color: '#10B981',
        isDefault: false,
        sortOrder: 3
      },
      {
        name: 'Inspiración',
        description: 'Quotes, motivación e inspiración',
        color: '#F59E0B',
        isDefault: false,
        sortOrder: 4
      }
    ];

    try {
      await prisma.category.createMany({
        data: defaultCategories.map(category => ({
          ...category,
          userId
        }))
      });

      logAuth('DEFAULT_CATEGORIES_CREATED', {
        userId,
        categoriesCount: defaultCategories.length
      });

    } catch (error) {
      logError(error, {
        context: 'create_default_categories',
        userId
      });
      // No lanzar error, las categorías son opcionales
    }
  }

  // Proceso completo de autenticación
  async initiateAuth() {
    const { state, codeVerifier, codeChallenge } = this.generatePKCEParams();
    const authURL = this.generateAuthURL(state, codeChallenge);

    // En una aplicación real, guardarías state y codeVerifier en sesión o cache
    // Para este ejemplo, los devolvemos para que el cliente los maneje
    return {
      authURL,
      state,
      codeVerifier
    };
  }

  // Completar autenticación con callback
  async completeAuth(code, state, codeVerifier) {
    try {
      // Intercambiar código por tokens
      const tokens = await this.exchangeCodeForTokens(code, codeVerifier, state);

      console.log('tokens', tokens);

      // Crear o actualizar usuario
      const user = await this.createOrUpdateUser(tokens);

      console.log('user', user);

      // Generar JWT para la aplicación
      const { accessToken: appToken } = generateTokens(user.id);

      logAuth('AUTH_COMPLETE', {
        userId: user.id,
        username: user.username
      });

      return {
        user: {
          id: user.id,
          twitterId: user.twitterId,
          username: user.username,
          displayName: user.displayName,
          lastSync: user.lastSync
        },
        accessToken: appToken
      };

    } catch (error) {
      logError(error, {
        context: 'complete_auth',
        state: state.substring(0, 8) + '...'
      });

      throw error;
    }
  }

  // Logout - revocar tokens
  async logout(userId) {
    try {
      // Actualizar usuario para marcarlo como inactivo
      await prisma.user.update({
        where: { id: userId },
        data: {
          accessToken: null,
          refreshToken: null,
          isActive: false
        }
      });

      logAuth('LOGOUT_SUCCESS', { userId });

      return { success: true };

    } catch (error) {
      logError(error, {
        context: 'logout',
        userId
      });

      throw new AppError('Error durante logout', 500, 'LOGOUT_ERROR');
    }
  }

  // Validar y refrescar token de usuario si es necesario
  async validateAndRefreshUserToken(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          accessToken: true,
          refreshToken: true,
          isActive: true
        }
      });

      if (!user || !user.isActive) {
        throw new AppError('Usuario no encontrado o inactivo', 404);
      }

      // Intentar usar el token actual
      try {
        await getCurrentUser(user.accessToken);
        return user.accessToken; // Token válido
      } catch (error) {
        // Token expirado, intentar refrescar
        if (error.statusCode === 401 && user.refreshToken) {
          logAuth('TOKEN_EXPIRED_REFRESHING', { userId });
          
          const newTokens = await this.refreshAccessToken(user.refreshToken);
          
          // Actualizar tokens en BD
          await prisma.user.update({
            where: { id: userId },
            data: {
              accessToken: newTokens.accessToken,
              refreshToken: newTokens.refreshToken
            }
          });

          return newTokens.accessToken;
        }

        throw new AppError('Token inválido y no se puede refrescar', 401);
      }

    } catch (error) {
      if (error.isAppError) {
        throw error;
      }

      logError(error, {
        context: 'validate_and_refresh_token',
        userId
      });

      throw new AppError('Error validando token de usuario', 500);
    }
  }
}

// Exportar instancia singleton
const authService = new AuthService();

export { authService };
export default authService;