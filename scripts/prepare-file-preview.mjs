import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const indexPath = join(process.cwd(), 'dist', 'index.html');
const html = readFileSync(indexPath, 'utf8');

writeFileSync(indexPath, html.replaceAll('src="/_expo/', 'src="./_expo/'));
