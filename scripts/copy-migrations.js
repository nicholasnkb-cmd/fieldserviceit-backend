const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'src', 'database', 'migrations');
const target = path.join(__dirname, '..', 'dist', 'database', 'migrations');

if (!fs.existsSync(source)) process.exit(0);
fs.mkdirSync(target, { recursive: true });
for (const file of fs.readdirSync(source)) {
  if (file.endsWith('.sql')) {
    fs.copyFileSync(path.join(source, file), path.join(target, file));
  }
}
