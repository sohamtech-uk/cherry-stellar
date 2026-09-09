import { readFile } from 'node:fs/promises';
import { applyExtension } from '../../scripts/apply-extension.mjs';

const image = process.env.CHERRY_MONEY_IMAGE;
const commit = process.env.STELLAR_SOURCE_SHA;
if (!/^[-a-z0-9.]+\.azurecr\.io\/[a-z0-9/_-]+@sha256:[a-f0-9]{64}$/.test(image ?? '')) throw new Error('An immutable private ACR base image is required.');
if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('The exact Stellar source commit is required.');
const lock = JSON.parse(await readFile('base.lock.json', 'utf8'));
await applyExtension(process.cwd(), '/overlay', {
  repository: lock.repository,
  delivery: 'azure-development-container',
  // Container deployments pin the running development image; source assembly uses base.lock.json.
  containerImage: image,
  stellarCommit: commit,
});
console.log('Applied Stellar extension to private development image.');
