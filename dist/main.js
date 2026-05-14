"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const swagger_1 = require("@nestjs/swagger");
const helmet_1 = require("helmet");
const path_1 = require("path");
const fs_1 = require("fs");
const app_module_1 = require("./app.module");
const logFile = (0, path_1.join)(__dirname, '..', 'startup.log');
function logToFile(msg) {
    try {
        (0, fs_1.appendFileSync)(logFile, `[${new Date().toISOString()}] ${msg}\n`);
    }
    catch { }
}
function env(name) {
    const val = process.env[name];
    if (name === 'DATABASE_URL' && val) {
        return val.substring(0, 30) + '...(truncated)';
    }
    return val || '(NOT SET)';
}
async function bootstrap() {
    logToFile('=== BACKEND STARTUP ===');
    logToFile(`CWD: ${process.cwd()}`);
    logToFile(`NODE_ENV: ${env('NODE_ENV')}`);
    logToFile(`PORT: ${env('PORT')}`);
    logToFile(`DATABASE_URL: ${env('DATABASE_URL')}`);
    logToFile(`JWT_SECRET: ${env('JWT_SECRET')}`);
    logToFile('Creating NestJS application...');
    console.log('[Bootstrap] Starting NestJS application...');
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    logToFile('NestJS application created successfully');
    const configService = app.get(config_1.ConfigService);
    const logger = new common_1.Logger('Bootstrap');
    console.log('[Bootstrap] App module created, configuring...');
    app.setGlobalPrefix('v1');
    app.use((0, helmet_1.default)({
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
        origin: configService.get('CORS_ORIGIN', '*'),
        credentials: true,
    });
    const storageType = configService.get('STORAGE_TYPE', 'local');
    if (storageType === 'local') {
        app.useStaticAssets((0, path_1.join)(process.cwd(), 'uploads'), { prefix: '/uploads' });
        console.log('[Bootstrap] Serving uploads from local disk');
    }
    else {
        console.log(`[Bootstrap] Using S3-compatible storage (type: ${storageType})`);
    }
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
    }));
    const port = configService.get('PORT', 4000);
    console.log(`[Bootstrap] PORT resolved to: ${port}`);
    logToFile(`Binding to port: ${port}`);
    const nodeEnv = configService.get('NODE_ENV', 'development');
    console.log(`[Bootstrap] NODE_ENV: ${nodeEnv}`);
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
        console.log(`[Bootstrap] Swagger docs at http://localhost:${port}/docs`);
    }
    console.log(`[Bootstrap] Calling app.listen(${port}, '0.0.0.0')...`);
    logToFile(`Calling app.listen(${port}, '0.0.0.0')...`);
    await app.listen(port, '0.0.0.0');
    console.log(`[Bootstrap] Server running on http://0.0.0.0:${port}`);
    logToFile(`Server listening on 0.0.0.0:${port}`);
}
process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason);
    console.error('[Process] Unhandled Rejection:', reason instanceof Error ? reason.message : String(reason));
    logToFile(`UNHANDLED REJECTION: ${msg}`);
});
bootstrap().catch((err) => {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    console.error('[Bootstrap] FATAL: Application failed to start');
    console.error('[Bootstrap]', err instanceof Error ? err.message : String(err));
    console.error('[Bootstrap]', err instanceof Error ? err.stack : '');
    logToFile(`BOOTSTRAP FAILED: ${msg}`);
    process.exit(1);
});
//# sourceMappingURL=main.js.map