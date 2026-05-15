console.log('=== START WRAPPER ===');
console.log('CWD:', process.cwd());
console.log('PORT:', process.env.PORT || '(not set)');
console.log('NODE_ENV:', process.env.NODE_ENV || '(not set)');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET (truncated)' : '(not set)');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : '(not set)');
console.log('Has node_modules/@nestjs/core:', (() => { try { require.resolve('@nestjs/core'); return 'YES' } catch(e) { return 'NO - ' + e.message } })());
console.log('Has dist/main.js:', (() => { try { require.resolve('./dist/main.js'); return 'YES' } catch(e) { return 'NO - ' + e.message } })());
console.log('Starting app...');
try {
  require('./dist/main.js');
} catch(e) {
  console.log('APP CRASHED:', e.message);
  console.log(e.stack);
}
