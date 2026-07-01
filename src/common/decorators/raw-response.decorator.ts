import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'rawResponse';
export const RawResponse = (contentType = 'application/json') => SetMetadata(RAW_RESPONSE_KEY, contentType);
