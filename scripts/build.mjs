import { mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const file of ['app.js', 'hosted.js', 'style.css']) await copyFile(`public/${file}`, `dist/${file}`);
await copyFile('node_modules/@stellar/stellar-sdk/dist/stellar-sdk.min.js', 'dist/stellar-sdk.js');
const html = (await readFile('public/index.html', 'utf8')).replace('<script defer src="/app.js">', '<script defer src="/hosted.js"></script><script defer src="/app.js">');
await writeFile('dist/index.html', html);
console.log('Built hosted demo in dist/');
