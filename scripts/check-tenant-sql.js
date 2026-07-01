const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..', 'src', 'modules');
const tenantTables = [
  'Asset',
  'Dispatch',
  'InventoryLocation',
  'InventoryPart',
  'KbArticle',
  'MaintenancePlan',
  'MaintenanceRun',
  'NetworkAlertEvent',
  'NetworkAlertRule',
  'NetworkDeviceAction',
  'NetworkSite',
  'NetworkTopologyLink',
  'SecurityFinding',
  'ServiceInvoice',
  'ServiceQuote',
  'Ticket',
];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() && entry.name.endsWith('.service.ts') ? [fullPath] : [];
  });
}

const violations = [];
for (const file of walk(root)) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

  function visit(node) {
    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) {
      const sql = node.getText(ast);
      for (const table of tenantTables) {
        const mutation = new RegExp(`(?:UPDATE|DELETE FROM)\\s+${table}\\b`, 'i');
        if (mutation.test(sql) && !/companyId/i.test(sql)) {
          const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
          violations.push(`${path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/')}:${line} (${table})`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(ast);
}

if (violations.length) {
  console.error('Tenant-owned UPDATE/DELETE statements must include companyId:');
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exit(1);
}

console.log(`Tenant SQL gate passed for ${tenantTables.length} tenant-owned tables.`);
