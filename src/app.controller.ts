import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get()
  root() {
    return {
      name: 'FieldserviceIT API',
      status: 'ok',
      message: 'This is the backend API. Open the web app on port 3000.',
      frontend: 'http://127.0.0.1:3000',
      health: '/v1/health',
      apiPrefix: '/v1',
    };
  }
}
