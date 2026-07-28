import { GUARDS_METADATA } from '@nestjs/common/constants';
import { STEP_UP_KEY } from '../../common/decorators/step-up.decorator';
import { StepUpGuard } from '../../common/guards/step-up.guard';
import { PrivacyRequestsController } from './privacy-requests.controller';

describe('PrivacyRequestsController authorization', () => {
  it('enforces step-up authentication on administrative updates', () => {
    const handler = PrivacyRequestsController.prototype.update;
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) || [];

    expect(Reflect.getMetadata(STEP_UP_KEY, handler)).toBe(true);
    expect(guards).toContain(StepUpGuard);
  });
});
