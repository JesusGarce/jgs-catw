# Extensión de Chrome para catw

Esta extensión permite extraer tweets guardados de Twitter/X y enviarlos al backend de la aplicación catw.

## Instalación

1. Abre Chrome y ve a `chrome://extensions/`
2. Activa el "Modo de desarrollador" en la esquina superior derecha
3. Haz clic en "Cargar extensión sin empaquetar"
4. Selecciona la carpeta `extension/` de este proyecto
5. La extensión aparecerá en tu lista de extensiones

## Uso

### Autenticación Automática

La extensión se autentica automáticamente si ya tienes una sesión activa en la aplicación web:

1. **Si ya estás autenticado en la web:**
   - La extensión detectará automáticamente tu sesión
   - Verás tu información de usuario en la extensión
   - No necesitas configurar nada manualmente

2. **Si no estás autenticado:**
   - Haz clic en "Abrir Aplicación Web" para ir a la aplicación
   - Inicia sesión en la aplicación web
   - La extensión se autenticará automáticamente

3. **Configuración manual (opcional):**
   - Haz clic en "Configurar Autenticación"
   - Ingresa tu token de autenticación manualmente

### Extraer y Enviar Tweets

1. **Extraer tweets:**
   - Ve a [twitter.com/i/bookmarks](https://twitter.com/i/bookmarks)
   - Haz scroll hacia abajo para cargar más tweets
   - La extensión automáticamente detectará y extraerá los tweets

2. **Enviar datos:**
   - Haz clic en el icono de la extensión
   - Verás el número de tweets cargados y tu información de usuario
   - Haz clic en "Enviar a Backend" para enviar los datos

## Datos extraídos

La extensión extrae la siguiente información de cada tweet:

- URL del tweet
- Nombre del usuario
- Handle del usuario (@usuario)
- Imagen de perfil del usuario
- Contenido del tweet
- URLs de medios (imágenes/videos)

## Permisos

La extensión requiere los siguientes permisos:

- `scripting`: Para ejecutar scripts en la página de Twitter
- `storage`: Para guardar el token de autenticación
- Acceso a `x.com/i/bookmarks`: Para extraer tweets
- Acceso a `192.168.31.157:3001`: Para enviar datos al backend

## Solución de problemas

- **"No se encontró token de autenticación"**: Configura tu token desde la aplicación web
- **"Error del servidor"**: Verifica que el backend esté ejecutándose en `http://192.168.31.157:3001`
- **No se detectan tweets**: Asegúrate de estar en la página correcta y haz scroll para cargar tweets
