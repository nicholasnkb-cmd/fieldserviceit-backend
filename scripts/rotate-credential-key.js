const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

const apply = process.argv.includes('--apply');
const databaseUrl = process.env.DATABASE_URL;
const current = process.env.CREDENTIAL_ENCRYPTION_KEY;
const previous = process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS;
if (!databaseUrl || !current || !previous) {
  throw new Error('DATABASE_URL, CREDENTIAL_ENCRYPTION_KEY, and CREDENTIAL_ENCRYPTION_KEY_PREVIOUS are required');
}

const key = (value) => crypto.createHash('sha256').update(value).digest();
const currentKey = key(current);
const previousKey = key(previous);

function decrypt(value) {
  if (!value || !value.startsWith('ENC:')) return null;
  const [, iv, tag, encrypted] = value.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', previousKey, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', currentKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `ENC:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

const targets = [
  ['EmailProviderConfig', 'id', 'encryptedPassword'],
  ['RmmProviderConfig', 'id', 'credentials'],
  ['NetworkCredential', 'id', 'secret'],
  ['NetworkMonitoringConfig', 'assetId', 'snmpCommunity'],
  ['NetworkMonitoringConfig', 'assetId', 'vendorApiKey'],
];

(async () => {
  const connection = await mysql.createConnection(databaseUrl);
  let rotated = 0;
  try {
    if (apply) await connection.beginTransaction();
    for (const [table, idColumn, valueColumn] of targets) {
      let rows;
      try {
        [rows] = await connection.query(`SELECT \`${idColumn}\` id, \`${valueColumn}\` value FROM \`${table}\` WHERE \`${valueColumn}\` LIKE 'ENC:%'`);
      } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') continue;
        throw error;
      }
      for (const row of rows) {
        const plaintext = decrypt(row.value);
        if (plaintext === null) continue;
        rotated += 1;
        if (apply) {
          await connection.execute(`UPDATE \`${table}\` SET \`${valueColumn}\` = ? WHERE \`${idColumn}\` = ?`, [encrypt(plaintext), row.id]);
        }
      }
    }
    if (apply) await connection.commit();
    console.log(`${apply ? 'Rotated' : 'Would rotate'} ${rotated} encrypted credential value(s).`);
    if (!apply) console.log('Dry run only. Re-run with --apply after verifying a backup exists.');
  } catch (error) {
    if (apply) await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
