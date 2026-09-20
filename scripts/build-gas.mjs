import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gasDir = path.join(root, 'gas');

const [sourceHtml, css, simulatorSource, appSource] = await Promise.all([
  readFile(path.join(root, 'index.html'), 'utf8'),
  readFile(path.join(root, 'styles.css'), 'utf8'),
  readFile(path.join(root, 'simulator.js'), 'utf8'),
  readFile(path.join(root, 'app.js'), 'utf8'),
]);

const simulator = simulatorSource.replace(/\bexport\s+/g, '');
const app = appSource.replace(
  /^import\s*\{[^}]+\}\s*from\s*['"]\.\/simulator\.js['"];?\s*/,
  '',
);

let bundled = sourceHtml
  .replace(
    '<link rel="stylesheet" href="styles.css">',
    `<style>\n/* styles.css — GAS用に自動埋め込み */\n${css}\n</style>`,
  )
  .replace(
    '<script type="module" src="app.js"></script>',
    `<script>\n/* simulator.js + app.js — GAS用に自動埋め込み */\n${simulator}\n\n${app}\n</script>`,
  )
  .replace('<head>', '<head>\n  <base target="_top">');

if (bundled.includes('src="app.js"') || bundled.includes('href="styles.css"')) {
  throw new Error('外部ファイル参照をGAS用HTMLへ埋め込めませんでした。');
}

await mkdir(gasDir, { recursive: true });
await writeFile(path.join(gasDir, 'Index.html'), bundled, 'utf8');
console.log(`Generated gas/Index.html (${Buffer.byteLength(bundled)} bytes)`);
