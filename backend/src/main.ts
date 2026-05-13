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
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.enableCors({
    origin: configService.get('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true,
  });

  const storageType = configService.get('STORAGE_TYPE', 'local');
  if (storageType === 'local') {
    app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
    logger.log('Serving uploads from local disk');
  } else {
    logger.log(`Using S3-compatible storage (type: ${storageType})`);
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
    logger.log(`Swagger docs at http://localhost:${port}/docs`);
  }

  await app.listen(port);
  logger.log(`Server running on http://localhost:${port}`);

}

bootstrap();
