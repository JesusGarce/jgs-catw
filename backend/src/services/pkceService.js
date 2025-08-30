import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();

class PKCEService {
  constructor() {
    this.expirationTime = 5 * 60 * 1000; // 5 minutos en ms
  }

  // Guardar estado PKCE en la base de datos
  async saveState(state, codeVerifier) {
    try {
      await prisma.pKCEState.create({
        data: {
          state,
          codeVerifier
        }
      });

      logger.info('PKCE state saved', {
        state: state.substring(0, 8) + '...',
        timestamp: new Date().toISOString()
      });

      return true;
    } catch (error) {
      logger.error('Error saving PKCE state', {
        error: error.message,
        state: state.substring(0, 8) + '...'
      });
      throw error;
    }
  }

  // Recuperar estado PKCE de la base de datos
  async getState(state) {
    try {
      const pkceState = await prisma.pKCEState.findUnique({
        where: { state }
      });

      if (!pkceState) {
        logger.warn('PKCE state not found', {
          state: state.substring(0, 8) + '...'
        });
        return null;
      }

      // Verificar si ha expirado
      const age = Date.now() - pkceState.createdAt.getTime();
      if (age > this.expirationTime) {
        logger.warn('PKCE state expired', {
          state: state.substring(0, 8) + '...',
          age: Math.round(age / 1000) + 's'
        });
        
        // Eliminar estado expirado
        await this.deleteState(state);
        return null;
      }

      logger.info('PKCE state retrieved', {
        state: state.substring(0, 8) + '...',
        age: Math.round(age / 1000) + 's'
      });

      return pkceState.codeVerifier;
    } catch (error) {
      logger.error('Error retrieving PKCE state', {
        error: error.message,
        state: state.substring(0, 8) + '...'
      });
      throw error;
    }
  }

  // Eliminar estado PKCE
  async deleteState(state) {
    try {
      await prisma.pKCEState.delete({
        where: { state }
      });

      logger.info('PKCE state deleted', {
        state: state.substring(0, 8) + '...'
      });

      return true;
    } catch (error) {
      logger.error('Error deleting PKCE state', {
        error: error.message,
        state: state.substring(0, 8) + '...'
      });
      // No lanzar error, el estado podría no existir
      return false;
    }
  }

  // Limpiar estados expirados
  async cleanupExpiredStates() {
    try {
      const expirationDate = new Date(Date.now() - this.expirationTime);
      
      const result = await prisma.pKCEState.deleteMany({
        where: {
          createdAt: {
            lt: expirationDate
          }
        }
      });

      if (result.count > 0) {
        logger.info('Cleaned up expired PKCE states', {
          count: result.count
        });
      }

      return result.count;
    } catch (error) {
      logger.error('Error cleaning up expired PKCE states', {
        error: error.message
      });
      return 0;
    }
  }

  // Obtener estadísticas del almacén PKCE
  async getStats() {
    try {
      const total = await prisma.pKCEState.count();
      const expired = await prisma.pKCEState.count({
        where: {
          createdAt: {
            lt: new Date(Date.now() - this.expirationTime)
          }
        }
      });

      return {
        total,
        expired,
        valid: total - expired
      };
    } catch (error) {
      logger.error('Error getting PKCE stats', {
        error: error.message
      });
      return { total: 0, expired: 0, valid: 0 };
    }
  }
}

// Exportar instancia singleton
const pkceService = new PKCEService();

// Limpiar estados expirados cada 2 minutos
setInterval(async () => {
  try {
    await pkceService.cleanupExpiredStates();
  } catch (error) {
    logger.error('Error in PKCE cleanup interval', { error: error.message });
  }
}, 2 * 60 * 1000);

export { pkceService };
export default pkceService;

