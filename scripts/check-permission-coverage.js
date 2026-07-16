const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'src', 'modules');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() && entry.name.endsWith('controller.ts') ? [fullPath] : [];
  });
}

function scan(file) {
  const source = fs.readFileSync(file, 'utf8');
  const relativeFile = path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/');
  const controller = source.match(/@Controller\(([^)]*)\)/)?.[1]?.replace(/['"`]/g, '') || relativeFile;
  const classHeader = source.split(/export class/)[0] || '';
  const classUsesJwt = /@UseGuards\([^)]*JwtAuthGuard/.test(classHeader);
  const classUsesPermissions = /@UseGuards\([^)]*PermissionsGuard/.test(classHeader)
    && /@RequirePermissions\(/.test(classHeader);
  const lines = source.split(/\r?\n/);
  const routes = [];
  const invalidExemptions = [];
  for (let index = 0; index < lines.length; index += 1) {
    const route = lines[index].match(/@(Get|Post|Patch|Put|Delete)\(([^)]*)\)/);
    if (!route) continue;
    const decoratorLines = [lines[index]];
    for (let before = index - 1; before >= 0 && lines[before].trim().startsWith('@'); before -= 1) decoratorLines.unshift(lines[before]);
    for (let after = index + 1; after < lines.length && lines[after].trim().startsWith('@'); after += 1) decoratorLines.push(lines[after]);
    const decorators = decoratorLines.join('\n');
    const isPublic = /@Public\(\)/.test(decorators);
    const authenticated = !isPublic && (classUsesJwt || /JwtAuthGuard/.test(decorators));
    const exemption = decorators.match(/@AuthorizationExempt\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]\s*,\s*['"`](\d{4}-\d{2}-\d{2})['"`]\s*\)/);
    if (/@AuthorizationExempt\(/.test(decorators) && !exemption) {
      invalidExemptions.push({
        key: `${route[1].toUpperCase()} ${controller}/${route[2].replace(/['"`]/g, '')}`,
        file: relativeFile,
        line: index + 1,
      });
    }
    if (exemption && exemption[3] < new Date().toISOString().slice(0, 10)) {
      invalidExemptions.push({
        key: `${route[1].toUpperCase()} ${controller}/${route[2].replace(/['"`]/g, '')} (review overdue)`,
        file: relativeFile,
        line: index + 1,
      });
    }
    const permissionProtected = isPublic || Boolean(exemption) || classUsesPermissions
      || (/PermissionsGuard/.test(decorators) && /@RequirePermissions\(/.test(decorators))
      || /@RequirePermissions\(/.test(decorators);
    if (authenticated && !permissionProtected) {
      routes.push({
        key: `${route[1].toUpperCase()} ${controller}/${route[2].replace(/['"`]/g, '')}`,
        file: relativeFile,
        line: index + 1,
      });
    }
  }
  return { routes, invalidExemptions };
}

const scanned = walk(root).map(scan);
const uncovered = scanned.flatMap((result) => result.routes).sort((a, b) => a.key.localeCompare(b.key));
const invalidExemptions = scanned.flatMap((result) => result.invalidExemptions);
if (invalidExemptions.length) {
  console.error('Authorization exemptions require reason, owner, and YYYY-MM-DD review date:');
  invalidExemptions.forEach((item) => console.error(`- ${item.key} (${item.file}:${item.line})`));
  process.exit(1);
}
if (uncovered.length) {
  console.error('Authenticated routes lack explicit permission enforcement or a documented exemption:');
  uncovered.forEach((item) => console.error(`- ${item.key} (${item.file}:${item.line})`));
  process.exit(1);
}
console.log('Authorization coverage gate passed. Every authenticated route is explicit.');
