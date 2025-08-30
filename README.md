# Plan de Desarrollo - Twitter Archiver App

## 📋 Resumen del Proyecto

**Objetivo:** Aplicación para archivar, categorizar automáticamente y organizar tweets guardados con actualización diaria automática.

**Volumen estimado:** 5 tweets/día (~150/mes)

## 🛠️ Stack Tecnológico

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Base de datos:** MySQL 8.0
- **ORM:** Prisma (recomendado para tipado TypeScript)
- **Autenticación:** Passport.js con estrategia OAuth 2.0
- **Scheduler:** node-cron para tareas programadas
- **IA/ML:** @xenova/transformers (Transformers.js)

### Frontend
- **Framework:** Astro 4.0
- **Styling:** Tailwind CSS
- **Componentes:** Astro components + vanilla JS
- **Build:** Vite (integrado en Astro)

### APIs y Servicios
- **Twitter API v1.1:** Para aplicaciones standalone (limitado a timeline público)
- **Categorización:** Transformers.js (gratuito, local)

### DevOps
- **Contenedores:** Docker + Docker Compose
- **Variables de entorno:** dotenv
- **Logs:** Winston

## 🏗️ Arquitectura del Sistema

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Astro Frontend│────│   Node.js API    │────│     MySQL       │
│   (Tailwind)    │    │   (Express)      │    │   (Tweets DB)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Twitter API v2  │
                    │   (OAuth 2.0)    │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Transformers.js  │
                    │ (Categorización) │
                    └──────────────────┘
```

## 📅 Fases de Desarrollo

### Fase 1: Configuración Base (Semana 1-2)

#### 1.1 Setup del Proyecto
**Tareas:**
- [x] Inicializar repositorio Git
- [ ] Configurar estructura de carpetas monorepo
- [ ] Setup Docker + Docker Compose
- [ ] Configurar variables de entorno

**Estructura de carpetas:**
```
twitter-archiver/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── middleware/
│   │   └── utils/
│   ├── prisma/
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/
│   │   └── styles/
│   ├── astro.config.mjs
│   ├── tailwind.config.js
│   └── package.json
├── docker-compose.yml
└── README.md
```

#### 1.2 Base de Datos
**Tareas:**
- [ ] Diseñar esquema de base de datos
- [ ] Configurar MySQL con Docker
- [ ] Setup Prisma ORM
- [ ] Crear migraciones iniciales

**Esquema de BD:**
```sql
-- Tabla usuarios
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    twitter_id VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabla tweets
CREATE TABLE tweets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tweet_id VARCHAR(255) UNIQUE NOT NULL,
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    author_username VARCHAR(255),
    author_name VARCHAR(255),
    created_at_twitter TIMESTAMP,
    bookmarked_at TIMESTAMP,
    category VARCHAR(100),
    confidence_score DECIMAL(3,2),
    processed BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_category (user_id, category),
    INDEX idx_bookmarked_at (bookmarked_at)
);

-- Tabla categorías
CREATE TABLE categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7), -- Para códigos hex de colores
    user_id INT NOT NULL,
    tweet_count INT DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY unique_user_category (user_id, name)
);
```

### Fase 2: Backend Core (Semana 2-3)

#### 2.1 Autenticación Twitter
**Tareas:**
- [ ] Configurar OAuth 2.0 con Twitter API
- [ ] Implementar middleware de autenticación
- [ ] Crear endpoints de login/logout
- [ ] Gestión de tokens de acceso

**Archivos clave:**
- `src/services/twitterAuth.js`
- `src/middleware/auth.js`
- `src/routes/auth.js`

**Puntos críticos:**
- Manejar refresh tokens correctamente
- Almacenar tokens de forma segura
- Implementar PKCE para OAuth 2.0

#### 2.2 Integración Twitter API
**Tareas:**
- [ ] Configurar cliente Twitter API v1.1
- [ ] Implementar obtención de timeline público
- [ ] Manejar paginación y límites de rate
- [ ] Sistema de reintentos con backoff exponencial

**Servicio Twitter:**
```javascript
// src/services/twitterService.js
class TwitterService {
  async getBookmarks(userId, paginationToken = null) {
    // Implementar lógica de obtención de bookmarks
    // Manejar rate limits
    // Procesar metadata de tweets
  }
  
  async syncUserTimeline(userId, screenName) {
    // Sincronización completa de bookmarks
    // Detectar nuevos tweets
    // Actualizar base de datos
  }
}
```

#### 2.3 Sistema de Categorización
**Tareas:**
- [ ] Integrar Transformers.js
- [ ] Configurar modelo de clasificación
- [ ] Implementar categorización automática
- [ ] Sistema de categorías personalizadas

**Servicio de IA:**
```javascript
// src/services/categorizationService.js
import { pipeline } from '@xenova/transformers';

class CategorizationService {
  async initializeModel() {
    this.classifier = await pipeline('text-classification', 
      'cardiffnlp/twitter-roberta-base-sentiment-latest');
  }
  
  async categorizeTweet(tweetContent) {
    // Procesar contenido del tweet
    // Aplicar modelo de clasificación
    // Devolver categoría y confianza
  }
  
  async batchCategorize(tweets) {
    // Procesar múltiples tweets
    // Optimizar para rendimiento
  }
}
```

### Fase 3: Automatización (Semana 3-4)

#### 3.1 Scheduler y Jobs
**Tareas:**
- [ ] Configurar node-cron
- [ ] Implementar job diario de sincronización
- [ ] Sistema de logs y monitoreo
- [ ] Manejo de errores y reintentos

**Job de sincronización:**
```javascript
// src/jobs/syncBookmarks.js
import cron from 'node-cron';

// Ejecutar diariamente a las 9:00 AM
cron.schedule('0 9 * * *', async () => {
  try {
    await syncAllUserBookmarks();
  } catch (error) {
    logger.error('Error en sincronización diaria:', error);
  }
});
```

#### 3.2 API REST
**Tareas:**
- [ ] Diseñar endpoints RESTful
- [ ] Implementar CRUD para tweets y categorías
- [ ] Sistema de búsqueda y filtros
- [ ] Paginación y ordenamiento

**Endpoints principales:**
```
GET    /api/tweets              # Listar tweets paginados
GET    /api/tweets/:id          # Obtener tweet específico
PUT    /api/tweets/:id/category # Actualizar categoría
DELETE /api/tweets/:id          # Eliminar tweet

GET    /api/categories          # Listar categorías del usuario
POST   /api/categories          # Crear nueva categoría
PUT    /api/categories/:id      # Actualizar categoría
DELETE /api/categories/:id      # Eliminar categoría

POST   /api/sync                # Forzar sincronización manual
GET    /api/stats               # Estadísticas del usuario
```

### Fase 4: Frontend (Semana 4-5)

#### 4.1 Layout y Navegación
**Tareas:**
- [ ] Crear layout base con Astro
- [ ] Implementar navegación responsive
- [ ] Configurar Tailwind CSS
- [ ] Componentes base reutilizables

**Componentes clave:**
- `src/layouts/Layout.astro`
- `src/components/Navigation.astro`
- `src/components/TweetCard.astro`
- `src/components/CategoryFilter.astro`

#### 4.2 Páginas Principales
**Tareas:**
- [ ] Dashboard principal
- [ ] Vista de categorías
- [ ] Búsqueda avanzada
- [ ] Configuración de usuario

**Páginas:**
```
src/pages/
├── index.astro          # Dashboard principal
├── categories/
│   ├── index.astro      # Lista de categorías
│   └── [slug].astro     # Tweets por categoría
├── search.astro         # Búsqueda avanzada
├── settings.astro       # Configuración
└── auth/
    ├── login.astro      # Página de login
    └── callback.astro   # Callback OAuth
```

#### 4.3 Funcionalidades Interactivas
**Tareas:**
- [ ] Filtros en tiempo real
- [ ] Cambio de categorías drag & drop
- [ ] Búsqueda instantánea
- [ ] Estadísticas visuales

### Fase 5: Testing y Optimización (Semana 5-6)

#### 5.1 Testing
**Tareas:**
- [ ] Tests unitarios para servicios
- [ ] Tests de integración para API
- [ ] Tests E2E con Playwright
- [ ] Cobertura de código >80%

#### 5.2 Optimización
**Tareas:**
- [ ] Optimizar consultas de base de datos
- [ ] Implementar caché con Redis (opcional)
- [ ] Optimizar bundle del frontend
- [ ] Configurar compresión gzip

## 🔧 Configuración y Variables de Entorno

### Backend (.env)
```env
# Base de datos
DATABASE_URL="mysql://user:password@localhost:3306/twitter_archiver"

# Twitter API
TWITTER_CLIENT_ID=your_client_id
TWITTER_CLIENT_SECRET=your_client_secret
TWITTER_CALLBACK_URL=http://localhost:3000/auth/callback

# JWT
JWT_SECRET=your_jwt_secret

# App
PORT=3000
NODE_ENV=development
```

### Frontend (.env)
```env
PUBLIC_API_URL=http://localhost:3000
```

## 📝 Puntos Críticos y Consideraciones

### Seguridad
- [ ] Validación de entrada en todos los endpoints
- [ ] Sanitización de contenido de tweets
- [ ] Rate limiting para API endpoints
- [ ] Manejo seguro de tokens OAuth

### Performance
- [ ] Índices de base de datos optimizados
- [ ] Paginación eficiente para grandes volúmenes
- [ ] Lazy loading en el frontend
- [ ] Optimización de modelo de IA

### UX/UI
- [ ] Estados de carga para sincronización
- [ ] Feedback visual para acciones del usuario
- [ ] Responsive design para móviles
- [ ] Accesibilidad (ARIA labels, contraste)

### Escalabilidad
- [ ] Arquitectura preparada para múltiples usuarios
- [ ] Sistema de logs estructurados
- [ ] Métricas de rendimiento
- [ ] Manejo de errores robusto

## 🚀 Comandos de Desarrollo

### Setup inicial
```bash
# Clonar y configurar
git clone <repo>
cd twitter-archiver
cp .env.example .env

# Instalar dependencias
npm run install:all

# Levantar servicios
docker-compose up -d
npm run dev
```

### Comandos útiles
```bash
# Backend
npm run dev:backend          # Desarrollo backend
npm run db:migrate          # Ejecutar migraciones
npm run db:seed             # Datos de prueba

# Frontend
npm run dev:frontend        # Desarrollo frontend
npm run build              # Build producción

# Testing
npm run test               # Tests unitarios
npm run test:e2e          # Tests end-to-end
npm run test:coverage     # Cobertura de código
```

## 📊 Métricas de Éxito

### Técnicas
- [ ] Tiempo de respuesta API < 200ms
- [ ] Sincronización diaria sin errores
- [ ] Precisión de categorización > 80%
- [ ] Uptime > 99%

### Funcionales
- [ ] Todos los bookmarks sincronizados correctamente
- [ ] Categorización automática funcional
- [ ] Interface intuitiva y responsive
- [ ] Búsqueda eficiente

## 🔄 Roadmap Post-MVP

### Mejoras Futuras
- [ ] Análisis de sentimientos
- [ ] Exportación de datos
- [ ] API pública
- [ ] Aplicación móvil nativa
- [ ] Integración con otras redes sociales

### Optimizaciones
- [ ] Caché inteligente
- [ ] Búsqueda full-text avanzada
- [ ] Machine learning personalizado
- [ ] Dashboard de analytics avanzado

---

**Tiempo estimado total:** 5-6 semanas
**Complejidad:** Media-Alta
**Costo de APIs:** 0€/mes (dentro de límites gratuitos)
