ALTER TABLE CompanyPlan ALTER COLUMN billingProvider SET DEFAULT 'PAYPAL';

UPDATE BillingPrice SET isActive = 0, updatedAt = NOW(3) WHERE provider <> 'PAYPAL';

UPDATE Permission SET description = 'Administer PayPal billing operations.' WHERE slug = 'billing.manage';
