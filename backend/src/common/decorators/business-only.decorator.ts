import { SetMetadata } from '@nestjs/common';

export const BUSINESS_ONLY_KEY = 'businessOnly';
export const BusinessOnly = () => SetMetadata(BUSINESS_ONLY_KEY, true);
