import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const srcApp = resolve(root, 'app');
const outRoot = resolve(root, 'public');
const outApp = resolve(outRoot, 'app');

// Build static output for Vercel projects configured with Output Directory = public.
// We copy app files to both:
// - public/      (works when serving static root directly)
// - public/app/  (backward compatibility with older rewrites)
rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });
mkdirSync(outApp, { recursive: true });
cpSync(srcApp, outRoot, { recursive: true });
cpSync(srcApp, outApp, { recursive: true });

console.log('Built static output at public/ and public/app');
