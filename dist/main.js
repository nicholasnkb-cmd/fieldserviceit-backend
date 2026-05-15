"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const swagger_1 = require("@nestjs/swagger");
const helmet_1 = require("helmet");
const path_1 = require("path");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_1.ConfigService);
    const logger = new common_1.Logger('Bootstrap');
    app.setGlobalPrefix('v1');
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: false,
    }));
    app.enableCors({
        origin: configService.get('CORS_ORIGIN', '*'),
        credentials: true,
    });
    const storageType = configService.get('STORAGE_TYPE', 'local');
    if (storageType === 'local') {
        app.useStaticAssets((0, path_1.join)(process.cwd(), 'uploads'), { prefix: '/uploads' });
    }
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
    }));
    const port = configService.get('PORT', 4000);
    const nodeEnv = configService.get('NODE_ENV', 'development');
    const swaggerEnabled = configService.get('SWAGGER_ENABLED', nodeEnv !== 'production');
    if (swaggerEnabled === true || swaggerEnabled === 'true') {
        const swaggerConfig = new swagger_1.DocumentBuilder()
            .setTitle('FieldserviceIT API')
            .setDescription('Multi-tenant enterprise workflow + IT operations platform')
            .setVersion('1.0')
            .addBearerAuth()
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
        swagger_1.SwaggerModule.setup('docs', app, document);
    }
    await app.listen(port, '0.0.0.0');
    logger.log(`Server running on port ${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map