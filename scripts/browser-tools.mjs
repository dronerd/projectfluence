import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireTool = createRequire(path.join(process.env.FLUENCE_BROWSER_TOOLS || projectRoot, 'package.json'));
export const { chromium } = requireTool('playwright');
export const AxeBuilder = requireTool('@axe-core/playwright').default;
export const baseUrl = process.env.FLUENCE_BASE_URL || 'http://127.0.0.1:3000';
export const outputDirectory = process.env.FLUENCE_SCREENSHOTS || path.join(os.tmpdir(), 'fluence-frontend-validation');
mkdirSync(outputDirectory, { recursive: true });
export const screenshotPath = (name) => path.join(outputDirectory, name);
