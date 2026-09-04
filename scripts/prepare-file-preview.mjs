import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const indexPath = join(process.cwd(), 'dist', 'index.html');
const html = readFileSync(indexPath, 'utf8');
const webLayoutStyles = '<style id="retail-web-layout-styles">html,body,#root{width:100%;max-width:100%;overflow-x:hidden;}#root{min-width:0;}</style>';

writeFileSync(
  indexPath,
  html
    .replaceAll('src="/_expo/', 'src="./_expo/')
    .replace('</head>', `    ${webLayoutStyles}\n  </head>`)
);
