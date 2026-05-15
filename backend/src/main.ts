import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('v1');
  app.use(helmet({
    contentSecurityPolicy: false,
  }));
  app.enableCors({
    origin: configService.get('CORS_ORIGIN', '*'),
    credentials: true,
  });

  const storageType = configService.get('STORAGE_TYPE', 'local');
  if (storageType === 'local') {
    app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = configService.get('PORT', 4000);
  const nodeEnv = configService.get('NODE_ENV', 'development');
  const swaggerEnabled = configService.get('SWAGGER_ENABLED', nodeEnv !== 'production');
  if (swaggerEnabled === true || swaggerEnabled === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('FieldserviceIT API')
      .setDescription('Multi-tenant enterprise workflow + IT operations platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(port, '0.0.0.0');
  logger.log(`Server running on port ${port}`);
}

bootstrap();
