import { register } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const envPath = join(process.cwd(), '.env.local');

if (existsSync(envPath)) {
  const envFile = readFileSync(envPath, 'utf8');

  for (const line of envFile.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#') || !trimmedLine.includes('=')) {
      continue;
    }

    const [key, ...valueParts] = trimmedLine.split('=');
    const value = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '');

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

register(new URL('./ts-extension-loader.mjs', import.meta.url));
