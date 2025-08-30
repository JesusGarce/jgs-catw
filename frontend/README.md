# Frontend - Twitter Archiver

Frontend de la aplicación Twitter Archiver construido con Astro y Tailwind CSS.

## 🚀 Características

- **Dashboard interactivo** con estadísticas en tiempo real
- **Gestión de tweets** con filtros y búsqueda avanzada
- **Sistema de categorías** personalizable
- **Sincronización manual** con indicadores de progreso
- **Diseño responsive** optimizado para móviles y desktop
- **Autenticación OAuth** con Twitter

## 🛠️ Tecnologías

- **Astro 5.13.5** - Framework web moderno
- **Tailwind CSS 4.1.12** - Framework de CSS utility-first
- **JavaScript ES6+** - Funcionalidades interactivas
- **Inter Font** - Tipografía moderna y legible

## 📦 Instalación

### Prerrequisitos

- Node.js 18+ 
- npm o yarn
- Backend funcionando en `http://127.0.0.1:3001`

### Pasos de instalación

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno:**
   Crear archivo `.env` en el directorio `frontend/`:
   ```env
   PUBLIC_API_URL=http://127.0.0.1:3001
   ```

3. **Iniciar servidor de desarrollo:**
   ```bash
   npm run dev
   ```

4. **Abrir en el navegador:**
   ```
   http://localhost:4321
   ```

## 🏗️ Estructura del Proyecto

```
frontend/
├── src/
│   ├── components/          # Componentes reutilizables
│   ├── layouts/            # Layouts de página
│   │   └── Layout.astro    # Layout principal
│   ├── pages/              # Páginas de la aplicación
│   │   ├── index.astro     # Dashboard principal
│   │   ├── tweets.astro    # Lista de tweets
│   │   ├── categories.astro # Gestión de categorías
│   │   └── sync.astro      # Sincronización
│   └── styles/             # Estilos globales
│       └── global.css      # Configuración de Tailwind
├── public/                 # Archivos estáticos
├── astro.config.mjs        # Configuración de Astro
├── tailwind.config.js      # Configuración de Tailwind
└── postcss.config.js       # Configuración de PostCSS
```

## 🎨 Componentes de Diseño

### Botones
- `.btn-primary` - Botón principal (azul)
- `.btn-secondary` - Botón secundario (gris)
- `.btn-twitter` - Botón de Twitter (azul Twitter)

### Tarjetas
- `.card` - Contenedor de tarjeta con sombra y bordes

### Badges
- `.badge-primary` - Badge azul
- `.badge-success` - Badge verde
- `.badge-warning` - Badge amarillo
- `.badge-error` - Badge rojo

### Formularios
- `.input` - Campo de entrada estilizado

## 📱 Páginas

### Dashboard (`/`)
- Estadísticas generales
- Acciones rápidas
- Tweets recientes
- Estado de sincronización

### Tweets (`/tweets`)
- Lista paginada de tweets
- Filtros por categoría y búsqueda
- Ordenamiento personalizable
- Cambio de categorías inline

### Categorías (`/categories`)
- Gestión de categorías
- Crear, editar y eliminar
- Colores personalizables
- Estadísticas por categoría

### Sincronizar (`/sync`)
- Sincronización manual
- Progreso en tiempo real
- Historial de sincronizaciones
- Estado actual del sistema

## 🔧 Configuración

### Tailwind CSS
El proyecto usa Tailwind CSS v4 con configuración personalizada:

```javascript
// tailwind.config.js
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        primary: { /* Paleta azul personalizada */ },
        twitter: { /* Paleta azul Twitter */ }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms')
  ]
}
```

### Astro
Configuración optimizada para desarrollo:

```javascript
// astro.config.mjs
export default defineConfig({
  integrations: [],
  server: {
    port: 4321,
    host: true
  },
  vite: {
    css: {
      postcss: './postcss.config.js'
    }
  }
});
```

## 🔌 API Integration

El frontend se comunica con el backend a través de la API REST:

### Endpoints principales:
- `GET /api/v1/stats` - Estadísticas del usuario
- `GET /api/v1/tweets` - Lista de tweets
- `POST /api/v1/sync` - Sincronización manual
- `GET /api/v1/categories` - Lista de categorías
- `POST /api/v1/categories` - Crear categoría
- `PUT /api/v1/categories/:id` - Actualizar categoría
- `DELETE /api/v1/categories/:id` - Eliminar categoría

### Autenticación:
- JWT Bearer Token almacenado en localStorage
- Verificación automática de token expirado
- Redirección a login si no autenticado

## 🚀 Scripts Disponibles

```bash
# Desarrollo
npm run dev          # Servidor de desarrollo en http://localhost:4321

# Producción
npm run build        # Build optimizado para producción
npm run preview      # Preview del build de producción

# Utilidades
npm run astro        # Comandos de Astro CLI
```

## 🎯 Funcionalidades Principales

### Dashboard
- ✅ Estadísticas en tiempo real
- ✅ Acciones rápidas
- ✅ Tweets recientes
- ✅ Estado de sincronización

### Gestión de Tweets
- ✅ Lista paginada
- ✅ Filtros avanzados
- ✅ Búsqueda por texto
- ✅ Ordenamiento personalizable
- ✅ Cambio de categorías

### Categorías
- ✅ CRUD completo
- ✅ Colores personalizables
- ✅ Estadísticas por categoría
- ✅ Protección de categorías por defecto

### Sincronización
- ✅ Sincronización manual
- ✅ Indicadores de progreso
- ✅ Historial de sincronizaciones
- ✅ Estados de error y éxito

## 🔒 Seguridad

- Validación de tokens JWT
- Sanitización de datos de entrada
- Protección contra XSS
- Headers de seguridad configurados

## 📱 Responsive Design

El frontend está optimizado para:
- **Desktop** (1024px+)
- **Tablet** (768px - 1023px)
- **Mobile** (320px - 767px)

## 🐛 Troubleshooting

### Error: "Cannot connect to API"
1. Verificar que el backend esté ejecutándose en `http://localhost:3000`
2. Verificar la configuración de CORS en el backend
3. Revisar la consola del navegador para errores específicos

### Error: "Authentication failed"
1. Verificar que el token JWT esté presente en localStorage
2. Intentar hacer logout y login nuevamente
3. Verificar que el backend esté configurado correctamente

### Error: "Tailwind styles not loading"
1. Verificar que `postcss.config.js` esté configurado
2. Reiniciar el servidor de desarrollo
3. Verificar que las clases de Tailwind estén en el contenido configurado

## 🤝 Contribución

1. Fork el proyecto
2. Crear una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.
