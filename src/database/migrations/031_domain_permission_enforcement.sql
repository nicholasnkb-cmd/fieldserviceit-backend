INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'Manage inventory', 'inventory.manage', 'Inventory', 'Create and update parts, locations, and stock movements.', NOW(3)),
  (UUID(), 'Manage knowledge base', 'knowledge-base.manage', 'Knowledge', 'Create, edit, archive, and remove knowledge articles.', NOW(3)),
  (UUID(), 'View workflows', 'workflows.view', 'Automation', 'View workflow definitions and execution history.', NOW(3)),
  (UUID(), 'Manage workflows', 'workflows.manage', 'Automation', 'Create and execute workflow definitions.', NOW(3)),
  (UUID(), 'View maintenance', 'maintenance.view', 'Field Service', 'View recurring maintenance plans and runs.', NOW(3)),
  (UUID(), 'Manage maintenance', 'maintenance.manage', 'Field Service', 'Create, update, generate, and complete maintenance work.', NOW(3)),
  (UUID(), 'View topology', 'topology.view', 'Network', 'View network topology, sites, links, and changes.', NOW(3)),
  (UUID(), 'Manage topology', 'topology.manage', 'Network', 'Manage network topology, layouts, sites, links, and shares.', NOW(3)),
  (UUID(), 'View security center', 'security-center.view', 'Security', 'View security posture, findings, events, and reviews.', NOW(3)),
  (UUID(), 'Manage security center', 'security-center.manage', 'Security', 'Create and update security findings.', NOW(3)),
  (UUID(), 'View operations', 'operations.view', 'Operations', 'View service operations workspaces and queues.', NOW(3)),
  (UUID(), 'Manage operations', 'operations.manage', 'Operations', 'Manage service operations workspaces and queues.', NOW(3)),
  (UUID(), 'Use AI agent', 'ai-agent.use', 'Automation', 'Use AI-assisted service operations tools.', NOW(3)),
  (UUID(), 'View service catalog', 'catalog.view', 'Service Catalog', 'View service catalog items, categories, and requests.', NOW(3)),
  (UUID(), 'Create catalog requests', 'catalog.create', 'Service Catalog', 'Submit service catalog requests.', NOW(3)),
  (UUID(), 'Manage service catalog', 'catalog.manage', 'Service Catalog', 'Manage catalog items and request lifecycle.', NOW(3)),
  (UUID(), 'View company settings', 'settings.view', 'Administration', 'View company configuration and branding.', NOW(3)),
  (UUID(), 'Manage company settings', 'settings.manage', 'Administration', 'Update company configuration and branding.', NOW(3)),
  (UUID(), 'View companies', 'companies.view', 'Administration', 'View company records and statistics.', NOW(3)),
  (UUID(), 'Manage companies', 'companies.manage', 'Administration', 'Create, update, and deactivate companies.', NOW(3)),
  (UUID(), 'Manage email operations', 'email-operations.manage', 'Security', 'Configure email providers, queues, deliveries, and templates.', NOW(3));

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3)
FROM Role r JOIN Permission p
WHERE r.slug = 'super-admin';

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3)
FROM Role r JOIN Permission p
WHERE r.slug = 'tenant-admin'
  AND p.slug IN (
    'inventory.view', 'inventory.manage', 'knowledge-base.view', 'knowledge-base.manage',
    'workflows.view', 'workflows.manage',
    'maintenance.view', 'maintenance.manage', 'topology.view', 'topology.manage',
    'security-center.view', 'security-center.manage', 'operations.view', 'operations.manage',
    'ai-agent.use', 'catalog.view', 'catalog.create', 'catalog.manage',
    'settings.view', 'settings.manage', 'companies.view', 'email-operations.manage'
  );

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3)
FROM Role r JOIN Permission p
WHERE r.slug IN ('technician', 'dispatcher')
  AND p.slug IN (
    'workflows.view', 'maintenance.view', 'topology.view',
    'operations.view', 'ai-agent.use', 'catalog.view', 'catalog.create'
  );
