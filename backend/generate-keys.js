import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });

const privBase64 = Buffer.from(privPem).toString('base64');
const pubBase64 = Buffer.from(pubPem).toString('base64');

const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
const cleanedLines = lines.filter(
  (line) => !line.startsWith('JWT_PRIVATE_KEY_BASE64=') && !line.startsWith('JWT_PUBLIC_KEY_BASE64=')
);
cleanedLines.push(`JWT_PRIVATE_KEY_BASE64=${privBase64}`);
cleanedLines.push(`JWT_PUBLIC_KEY_BASE64=${pubBase64}`);

fs.writeFileSync(envPath, cleanedLines.join('\n'));

console.log('Done.');
console.log('Private key preview:', privBase64.slice(0, 30));
console.log('Public key preview:', pubBase64.slice(0, 30));