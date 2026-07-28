// Generated from product/catalog.json by scripts/sync-product-catalog.mjs. Do not edit directly.
export const PRODUCT_CATALOG = {
  "currency": "USD",
  "lastReviewed": "2026-07-27",
  "plans": [
    {
      "id": "plan-free",
      "slug": "free",
      "name": "Free",
      "audience": "INDIVIDUAL",
      "description": "Basic ticket tracking for individuals",
      "monthlyPrice": 0,
      "annualPrice": 0,
      "seatMonthlyPrice": 0,
      "seatAnnualPrice": 0,
      "trialDays": 0,
      "maxUsers": 1,
      "maxTickets": 50,
      "sortOrder": 0,
      "features": {
        "tickets": true,
        "emailNotifications": true,
        "publicSubmit": true
      }
    },
    {
      "id": "plan-starter",
      "slug": "starter",
      "name": "Starter",
      "audience": "INDIVIDUAL",
      "description": "For individuals who need higher-volume support tracking",
      "monthlyPrice": 29,
      "annualPrice": 290,
      "seatMonthlyPrice": 0,
      "seatAnnualPrice": 0,
      "trialDays": 7,
      "maxUsers": 1,
      "maxTickets": -1,
      "sortOrder": 1,
      "features": {
        "tickets": true,
        "dispatch": true,
        "assets": true,
        "emailNotifications": true,
        "publicSubmit": true,
        "csvExport": true,
        "apiAccess": true
      }
    },
    {
      "id": "plan-business",
      "slug": "business",
      "name": "Business",
      "audience": "COMPANY",
      "description": "The company plan for MSP and IT service operations",
      "monthlyPrice": 79,
      "annualPrice": 790,
      "seatMonthlyPrice": 12,
      "seatAnnualPrice": 120,
      "trialDays": 14,
      "maxUsers": -1,
      "maxTickets": -1,
      "sortOrder": 2,
      "features": {
        "tickets": true,
        "dispatch": true,
        "assets": true,
        "emailNotifications": true,
        "publicSubmit": true,
        "csvExport": true,
        "apiAccess": true,
        "rmmIntegration": true,
        "slaManagement": true,
        "workflows": true,
        "reporting": true,
        "auditLogs": true,
        "branding": true,
        "timeTracking": true,
        "contracts": true,
        "kb": true,
        "catalogRequests": true,
        "network": true,
        "aiAgent": true,
        "billing": true
      }
    }
  ]
} as const;
