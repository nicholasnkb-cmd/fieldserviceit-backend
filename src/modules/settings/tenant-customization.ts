import { BadRequestException } from '@nestjs/common';

export interface TenantBranding {
  companyName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  loginBackgroundUrl?: string;
  sidebarImageUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  borderRadius?: number;
}

export interface TenantBanner {
  enabled?: boolean;
  text?: string;
  linkUrl?: string;
  linkLabel?: string;
  tone?: 'info' | 'success' | 'warning' | 'critical';
  dismissible?: boolean;
}

export interface TenantWorkflowPreferences {
  defaultTrigger?: string;
  defaultPriority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  requireApproval?: boolean;
  autoAssign?: boolean;
  approvalGroup?: string;
}

export interface TenantReportingPreferences {
  logoUrl?: string;
  headerText?: string;
  footerText?: string;
  accentColor?: string;
  defaultDateRange?: '7d' | '30d' | '90d' | 'quarter' | 'year';
  pageOrientation?: 'portrait' | 'landscape';
  showCompanyLogo?: boolean;
}

export interface TenantCustomization {
  banner?: TenantBanner;
  workflow?: TenantWorkflowPreferences;
  reporting?: TenantReportingPreferences;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ALLOWED_IMAGE_PATH = /^\/uploads\/branding\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/;
const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function optionalString(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : '';
}

function optionalColor(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return undefined;
  const color = String(value).trim();
  if (!HEX_COLOR.test(color)) throw new BadRequestException(`${field} must be a six-digit hex color`);
  return color.toLowerCase();
}

function optionalUrl(value: unknown, field: string, imageOnly = false) {
  if (value === undefined || value === null) return undefined;
  if (value === '') return '';
  const normalized = String(value).trim();
  if (imageOnly && ALLOWED_IMAGE_PATH.test(normalized)) return normalized;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new BadRequestException(`${field} must be a valid URL or uploaded image path`);
  }
  if (!ALLOWED_LINK_PROTOCOLS.has(parsed.protocol)) {
    throw new BadRequestException(`${field} uses an unsupported URL protocol`);
  }
  return parsed.toString().slice(0, 1000);
}

export function sanitizeBranding(input: TenantBranding): TenantBranding {
  const borderRadius = input.borderRadius === undefined ? undefined : Number(input.borderRadius);
  if (borderRadius !== undefined && (!Number.isFinite(borderRadius) || borderRadius < 0 || borderRadius > 24)) {
    throw new BadRequestException('borderRadius must be between 0 and 24');
  }
  return {
    companyName: optionalString(input.companyName, 120),
    logoUrl: optionalUrl(input.logoUrl, 'logoUrl', true),
    faviconUrl: optionalUrl(input.faviconUrl, 'faviconUrl', true),
    loginBackgroundUrl: optionalUrl(input.loginBackgroundUrl, 'loginBackgroundUrl', true),
    sidebarImageUrl: optionalUrl(input.sidebarImageUrl, 'sidebarImageUrl', true),
    primaryColor: optionalColor(input.primaryColor, 'primaryColor'),
    secondaryColor: optionalColor(input.secondaryColor, 'secondaryColor'),
    accentColor: optionalColor(input.accentColor, 'accentColor'),
    backgroundColor: optionalColor(input.backgroundColor, 'backgroundColor'),
    surfaceColor: optionalColor(input.surfaceColor, 'surfaceColor'),
    textColor: optionalColor(input.textColor, 'textColor'),
    borderRadius: borderRadius === undefined ? undefined : Math.round(borderRadius),
  };
}

export function sanitizeCustomization(input: TenantCustomization): TenantCustomization {
  const banner = input.banner || {};
  const workflow = input.workflow || {};
  const reporting = input.reporting || {};
  const tones = new Set(['info', 'success', 'warning', 'critical']);
  const priorities = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
  const ranges = new Set(['7d', '30d', '90d', 'quarter', 'year']);
  const orientations = new Set(['portrait', 'landscape']);

  if (banner.tone && !tones.has(banner.tone)) throw new BadRequestException('Invalid banner tone');
  if (workflow.defaultPriority && !priorities.has(workflow.defaultPriority)) throw new BadRequestException('Invalid workflow priority');
  if (reporting.defaultDateRange && !ranges.has(reporting.defaultDateRange)) throw new BadRequestException('Invalid report date range');
  if (reporting.pageOrientation && !orientations.has(reporting.pageOrientation)) throw new BadRequestException('Invalid report orientation');

  return {
    banner: {
      enabled: banner.enabled === undefined ? undefined : Boolean(banner.enabled),
      text: optionalString(banner.text, 300),
      linkUrl: optionalUrl(banner.linkUrl, 'banner.linkUrl'),
      linkLabel: optionalString(banner.linkLabel, 60),
      tone: banner.tone,
      dismissible: banner.dismissible === undefined ? undefined : Boolean(banner.dismissible),
    },
    workflow: {
      defaultTrigger: optionalString(workflow.defaultTrigger, 100),
      defaultPriority: workflow.defaultPriority,
      requireApproval: workflow.requireApproval === undefined ? undefined : Boolean(workflow.requireApproval),
      autoAssign: workflow.autoAssign === undefined ? undefined : Boolean(workflow.autoAssign),
      approvalGroup: optionalString(workflow.approvalGroup, 120),
    },
    reporting: {
      logoUrl: optionalUrl(reporting.logoUrl, 'reporting.logoUrl', true),
      headerText: optionalString(reporting.headerText, 160),
      footerText: optionalString(reporting.footerText, 300),
      accentColor: optionalColor(reporting.accentColor, 'reporting.accentColor'),
      defaultDateRange: reporting.defaultDateRange,
      pageOrientation: reporting.pageOrientation,
      showCompanyLogo: reporting.showCompanyLogo === undefined ? undefined : Boolean(reporting.showCompanyLogo),
    },
  };
}

export function safeJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
