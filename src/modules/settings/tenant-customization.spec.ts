import { BadRequestException } from '@nestjs/common';
import { sanitizeBranding, sanitizeCustomization } from './tenant-customization';

describe('tenant customization validation', () => {
  it('normalizes supported branding values', () => {
    expect(sanitizeBranding({
      primaryColor: '#ABCDEF',
      logoUrl: '/uploads/branding/company-1/logo.png',
      borderRadius: 12,
    })).toMatchObject({
      primaryColor: '#abcdef',
      logoUrl: '/uploads/branding/company-1/logo.png',
      borderRadius: 12,
    });
  });

  it('rejects unsafe image protocols and invalid colors', () => {
    expect(() => sanitizeBranding({ logoUrl: 'javascript:alert(1)' })).toThrow(BadRequestException);
    expect(() => sanitizeBranding({ primaryColor: 'blue' })).toThrow(BadRequestException);
  });

  it('validates banner, workflow, and reporting options', () => {
    expect(sanitizeCustomization({
      banner: { enabled: true, tone: 'warning', text: 'Maintenance tonight' },
      workflow: { defaultPriority: 'HIGH', requireApproval: true },
      reporting: { defaultDateRange: '90d', pageOrientation: 'landscape' },
    })).toMatchObject({
      banner: { enabled: true, tone: 'warning' },
      workflow: { defaultPriority: 'HIGH', requireApproval: true },
      reporting: { defaultDateRange: '90d', pageOrientation: 'landscape' },
    });
  });
});
