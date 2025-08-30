import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function testDatabase() {
  console.log('🔍 Probando conexión a base de datos...\n');

  try {
    // 1. Probar conexión básica
    console.log('1️⃣ Probando conexión básica...');
    await prisma.$queryRaw`SELECT 1 as test`;
    console.log('   ✅ Conexión exitosa\n');

    // 2. Verificar tablas
    console.log('2️⃣ Verificando tablas...');
    const tables = await prisma.$queryRaw`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
    `;
    console.log('   📊 Tablas encontradas:', tables.length);
    tables.forEach(table => {
      console.log(`   - ${table.TABLE_NAME}`);
    });
    console.log();

    // 3. Verificar estructura de tabla users
    console.log('3️⃣ Verificando estructura de tabla users...');
    try {
      const userCount = await prisma.user.count();
      console.log(`   👥 Usuarios en BD: ${userCount}`);
    } catch (error) {
      console.log('   ⚠️ Error accediendo a tabla users:', error.message);
    }

    // 4. Verificar estructura de tabla tweets
    console.log('4️⃣ Verificando estructura de tabla tweets...');
    try {
      const tweetCount = await prisma.tweet.count();
      console.log(`   🐦 Tweets en BD: ${tweetCount}`);
    } catch (error) {
      console.log('   ⚠️ Error accediendo a tabla tweets:', error.message);
    }

    // 5. Verificar estructura de tabla categories
    console.log('5️⃣ Verificando estructura de tabla categories...');
    try {
      const categoryCount = await prisma.category.count();
      console.log(`   📁 Categorías en BD: ${categoryCount}`);
    } catch (error) {
      console.log('   ⚠️ Error accediendo a tabla categories:', error.message);
    }

    // 6. Información de versión
    console.log('6️⃣ Información del sistema...');
    const version = await prisma.$queryRaw`SELECT VERSION() as version`;
    console.log(`   🐬 MySQL Version: ${version[0].version}`);
    
    const dbName = await prisma.$queryRaw`SELECT DATABASE() as db_name`;
    console.log(`   🗄️  Base de datos actual: ${dbName[0].db_name}`);

    console.log('\n✅ Todas las verificaciones completadas correctamente!');

  } catch (error) {
    console.error('\n❌ Error de conexión:', error.message);
    console.error('\n🔧 Posibles soluciones:');
    console.error('   1. Verificar que MySQL esté corriendo');
    console.error('   2. Revisar credenciales en .env');
    console.error('   3. Verificar que la base de datos "twitter_archiver" exista');
    console.error('   4. Ejecutar: npx prisma db push');
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Función para crear datos de prueba
async function createSampleData() {
  console.log('\n🔬 Creando datos de prueba...');

  try {
    // Crear usuario de prueba
    const testUser = await prisma.user.upsert({
      where: { twitterId: 'test_user_123' },
      update: {},
      create: {
        twitterId: 'test_user_123',
        username: 'test_user',
        displayName: 'Usuario de Prueba',
        accessToken: 'fake_access_token',
        refreshToken: 'fake_refresh_token',
        isActive: true
      }
    });

    console.log(`   👤 Usuario de prueba creado: ${testUser.username} (ID: ${testUser.id})`);

    // Crear categorías de prueba
    const categories = [
      { name: 'Tecnología', color: '#3B82F6', description: 'Tweets sobre tech' },
      { name: 'Noticias', color: '#EF4444', description: 'Noticias importantes' }
    ];

    for (const categoryData of categories) {
      const category = await prisma.category.upsert({
        where: {
          unique_user_category: {
            userId: testUser.id,
            name: categoryData.name
          }
        },
        update: {},
        create: {
          ...categoryData,
          userId: testUser.id
        }
      });

      console.log(`   📁 Categoría creada: ${category.name}`);
    }

    // Crear tweet de prueba
    const tweet = await prisma.tweet.upsert({
      where: { tweetId: 'test_tweet_123' },
      update: {},
      create: {
        tweetId: 'test_tweet_123',
        userId: testUser.id,
        content: 'Este es un tweet de prueba para verificar la funcionalidad del sistema 🚀',
        authorUsername: 'test_author',
        authorName: 'Test Author',
        authorId: 'author_123',
        createdAtTwitter: new Date(),
        bookmarkedAt: new Date(),
        category: 'Tecnología',
        processed: true,
        retweetCount: 5,
        likeCount: 15,
        replyCount: 2
      }
    });

    console.log(`   🐦 Tweet de prueba creado: ${tweet.tweetId}`);

    console.log('\n✅ Datos de prueba creados correctamente!');

  } catch (error) {
    console.error('\n❌ Error creando datos de prueba:', error.message);
  }
}

// Ejecutar según argumentos de línea de comandos
const command = process.argv[2];

switch (command) {
  case 'test':
    await testDatabase();
    break;
  case 'sample':
    await testDatabase();
    await createSampleData();
    break;
  default:
    console.log('📖 Uso:');
    console.log('  node src/utils/dbTest.js test    # Solo probar conexión');
    console.log('  node src/utils/dbTest.js sample  # Probar y crear datos de muestra');
    break;
}