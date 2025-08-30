import express from 'express';
import { authService } from '../services/authService.js';
import { pkceService } from '../services/pkceService.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger, logAuth } from '../utils/logger.js';

const router = express.Router();

/**
 * GET /auth/login
 * Iniciar proceso de autenticación OAuth
 */
router.get('/login', async (req, res, next) => {
  try {
    const { authURL, state, codeVerifier } = await authService.initiateAuth();
    
    // Guardar parámetros PKCE en la base de datos
    await pkceService.saveState(state, codeVerifier);

    logAuth('LOGIN_INITIATED', {
      state: state.substring(0, 8) + '...',
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });

    // En desarrollo, devolver la URL para testing
    if (process.env.NODE_ENV === 'development') {
      res.json({
        authURL,
        message: 'Visita esta URL para autenticarte con Twitter',
        state: state.substring(0, 8) + '...'
      });
    } else {
      // En producción, redirigir directamente
      res.redirect(authURL);
    }

  } catch (error) {
    next(error);
  }
});

/**
 * GET /auth/callback
 * Callback de Twitter OAuth
 */
router.get('/callback', async (req, res, next) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Verificar si hay errores de OAuth
    if (error) {
      logAuth('OAUTH_ERROR', {
        error,
        error_description,
        state: state?.substring(0, 8) + '...'
      });

      return res.redirect(`${process.env.FRONTEND_URL}/auth/error?error=${encodeURIComponent(error_description || error)}`);
    }

    // Validar parámetros requeridos
    if (!code || !state) {
      logAuth('CALLBACK_MISSING_PARAMS', { hasCode: !!code, hasState: !!state });
      return res.redirect(`${process.env.FRONTEND_URL}/auth/error?error=missing_parameters`);
    }

    // Recuperar parámetros PKCE de la base de datos
    const codeVerifier = await pkceService.getState(state);
    if (!codeVerifier) {
      logAuth('PKCE_STATE_NOT_FOUND', { 
        state: state.substring(0, 8) + '...'
      });
      return res.redirect(`${process.env.FRONTEND_URL}/auth/error?error=invalid_state`);
    }

    // Eliminar estado usado
    await pkceService.deleteState(state);

    // Completar autenticación
    const authResult = await authService.completeAuth(code, state, codeVerifier);

    logAuth('CALLBACK_SUCCESS', {
      userId: authResult.user.id,
      username: authResult.user.username
    });

    // Redirigir al frontend con token
    const redirectURL = `${process.env.FRONTEND_URL}/auth/success?token=${authResult.accessToken}&user=${encodeURIComponent(JSON.stringify(authResult.user))}`;
    res.redirect(redirectURL);

  } catch (error) {
    logAuth('CALLBACK_ERROR', {
      error: error.message,
      state: req.query.state?.substring(0, 8) + '...'
    });

    res.redirect(`${process.env.FRONTEND_URL}/auth/error?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * POST /auth/logout
 * Cerrar sesión del usuario
 */
router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    await authService.logout(req.user.id);

    logAuth('LOGOUT_SUCCESS', {
      userId: req.user.id,
      username: req.user.username
    });

    res.json({
      success: true,
      message: 'Sesión cerrada exitosamente'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /auth/me
 * Obtener información del usuario autenticado
 */
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = {
      id: req.user.id,
      twitterId: req.user.twitterId,
      username: req.user.username,
      displayName: req.user.displayName,
      lastSync: req.user.lastSync
    };

    res.json({ user });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/refresh
 * Refrescar token de acceso a Twitter (no el JWT de la app)
 */
router.post('/refresh-twitter-token', authMiddleware, async (req, res, next) => {
  try {
    const newToken = await authService.validateAndRefreshUserToken(req.user.id);

    logAuth('TWITTER_TOKEN_REFRESHED', {
      userId: req.user.id,
      username: req.user.username
    });

    res.json({
      success: true,
      message: 'Token de Twitter actualizado'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /auth/status
 * Verificar estado de autenticación
 */
router.get('/status', authMiddleware, async (req, res, next) => {
  try {
    // Verificar si el token de Twitter sigue siendo válido
    let twitterTokenValid = true;
    try {
      await authService.validateAndRefreshUserToken(req.user.id);
    } catch (error) {
      twitterTokenValid = false;
    }

    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        displayName: req.user.displayName,
        lastSync: req.user.lastSync
      },
      twitterTokenValid,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /auth/debug-pkce
 * Debug del almacén PKCE (solo en desarrollo)
 */
router.get('/debug-pkce', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Solo disponible en desarrollo' });
  }

  try {
    const stats = await pkceService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;