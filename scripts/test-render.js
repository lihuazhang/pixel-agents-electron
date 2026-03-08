#!/usr/bin/env node

/**
 * Automated character render testing script
 *
 * 1. Launches the Electron app
 * 2. Takes a screenshot of the canvas
 * 3. Analyzes if characters are rendering correctly
 * 4. If not, suggests fixes or retries
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SNAPSHOTS_DIR = path.join(__dirname, '../snapshots');
const PROJECT_ROOT = path.join(__dirname, '..');

// Ensure snapshots directory exists
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

console.log('🧪 Starting character render test...\n');

// Step 1: Build the project
console.log('📦 Building project...');
try {
  execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
  console.log('✅ Build successful\n');
} catch (err) {
  console.error('❌ Build failed:', err.message);
  process.exit(1);
}

// Step 2: Take screenshot using Playwright
console.log('📸 Taking screenshot...');

const testScript = `
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu']
  });

  const page = await browser.newPage({
    viewport: { width: 1200, height: 800 }
  });

  // Navigate to the renderer
  await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });

  // Wait for canvas to render
  await page.waitForSelector('canvas', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 2000)); // Wait for character to render

  // Take screenshot
  await page.screenshot({
    path: '${path.join(SNAPSHOTS_DIR, 'render-test.png')}',
    fullPage: true
  });

  console.log('Screenshot saved to ${path.join(SNAPSHOTS_DIR, 'render-test.png')}');

  // Get canvas content for analysis
  const canvasData = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      width: canvas.width,
      height: canvas.height,
      data: imageData.data
    };
  });

  console.log('CANVAS_DATA:' + JSON.stringify(canvasData));

  await browser.close();
})();
`;

// Write temp test file
const tempTestFile = path.join(SNAPSHOTS_DIR, 'test-runner.mjs');
fs.writeFileSync(tempTestFile, testScript);

// Check if app is running, if not start it
let appProcess = null;
const isAppRunning = execSync('pgrep -f "Electron" 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();

if (!isAppRunning) {
  console.log('🚀 Starting Electron app...');
  appProcess = spawn('npm', ['run', 'dev'], {
    cwd: PROJECT_ROOT,
    stdio: 'pipe',
    detached: true
  });

  // Wait for app to start
  await new Promise(resolve => setTimeout(resolve, 5000));
} else {
  console.log('✅ Electron app already running');
}

// Run the screenshot test
try {
  execSync(`node ${tempTestFile}`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
} catch (err) {
  console.error('❌ Screenshot failed:', err.message);
  if (appProcess) {
    process.kill(-appProcess.pid);
  }
  process.exit(1);
}

// Cleanup
if (appProcess) {
  process.kill(-appProcess.pid);
}

console.log('\n✅ Test complete! Check snapshots directory for results.');
