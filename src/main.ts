import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'path';
import { json } from 'express';
import { AppModule } from './app.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(json({ verify: (req: any, _res, buf) => { req.rawBody = buf.toString(); } }));

  // Add correlation ID middleware early in the chain for request tracing
  app.use(CorrelationIdMiddleware.prototype.use.bind(new CorrelationIdMiddleware()));

  app.setGlobalPrefix('v1');
  app.enableShutdownHooks();
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=(), fullscreen=(self)');
    next();
  });
  const nodeEnv = configService.get('NODE_ENV', 'development');
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  if (!corsOrigin && nodeEnv === 'production') {
    logger.warn('CORS_ORIGIN not set — defaulting to localhost. Set CORS_ORIGIN env var for production.');
  }
  app.enableCors({
    origin: corsOrigin || 'http://localhost:3000',
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
  const swaggerEnabled = configService.get('SWAGGER_ENABLED', 'false');
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

bootstrap().catch((err) => {
  console.error('FATAL:', err?.message || err);
  process.exit(1);
});
