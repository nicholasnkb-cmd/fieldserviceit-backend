import { SetMetadata } from '@nestjs/common';

export const STEP_UP_KEY = 'stepUpRequired';
export const RequireStepUp = () => SetMetadata(STEP_UP_KEY, true);
