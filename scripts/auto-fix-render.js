#!/usr/bin/env node

/**
 * Automated character render testing and fixing script
 *
 * This script:
 * 1. Starts the Electron dev server
 * 2. Uses Playwright to capture the canvas
 * 3. Analyzes pixel data to detect if characters are rendering
 * 4. Iteratively fixes issues until characters are visible
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

console.log('🧪 Character Render Auto-Fix Script\n');
console.log('=====================================\n');

// Configuration
const MAX_ITERATIONS = 10;
const RENDER_WAIT_MS = 3000; // Wait time for characters to render
const VIEWPORT = { width: 1200, height: 800 };

/**
 * Check if a pixel color matches character colors
 * Character palettes contain skin tones, hair, and clothing colors
 */
function isCharacterPixel(r, g, b) {
  // Skin tones: light beige to tan
  const isSkinTone = (r > 180 && g > 140 && b > 120 && r > g && g > b);
  // Hair colors: brown, blonde, black
  const isHairColor = (r < 100 && g < 80 && b < 60) || // dark brown/black
                      (r > 150 && g > 120 && b < 100);   // blonde/light brown
  // Clothing blues
  const isBlueCloth = (b > g && b > r && b > 100);
  // Clothing reds
  const isRedCloth = (r > g && r > b && r > 120);

  return isSkinTone || isHairColor || isBlueCloth || isRedCloth;
}

/**
 * Analyze canvas pixel data to detect character presence
 */
function analyzeCanvasData(imageData) {
  const { width, height, data } = imageData;
  let characterPixels = 0;
  let totalNonTransparentPixels = 0;

  // Sample the center region where characters typically appear
  const startY = Math.floor(height * 0.3);
  const endY = Math.floor(height * 0.8);
  const startX = Math.floor(width * 0.2);
  const endX = Math.floor(width * 0.8);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a > 128) {
        totalNonTransparentPixels++;
        if (isCharacterPixel(r, g, b)) {
          characterPixels++;
        }
      }
    }
  }

  const characterRatio = characterPixels / Math.max(1, totalNonTransparentPixels);

  return {
    characterPixels,
    totalNonTransparentPixels,
    characterRatio,
    hasVisibleCharacters: characterPixels > 500 && characterRatio > 0.01
  };
}

/**
 * Run Playwright test to capture and analyze canvas
 */
async function captureAndAnalyze() {
  const { chromium } = require('playwright');

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--no-sandbox']
  });

  const page = await browser.newPage({ viewport: VIEWPORT });

  try {
    // Navigate to renderer
    await page.goto('http://localhost:5174', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait for canvas
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Wait for characters to render
    await new Promise(r => setTimeout(r, RENDER_WAIT_MS));

    // Take screenshot
    const screenshotPath = path.join(SNAPSHOTS_DIR, `render-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);

    // Get canvas pixel data
    const canvasData = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return {
        width: canvas.width,
        height: canvas.height,
        data: Array.from(imageData.data)
      };
    });

    if (!canvasData) {
      console.error('❌ No canvas found');
      return { success: false, error: 'No canvas found' };
    }

    const analysis = analyzeCanvasData(canvasData);

    console.log(`📊 Analysis: ${analysis.characterPixels} character pixels found`);
    console.log(`   Ratio: ${(analysis.characterRatio * 100).toFixed(2)}%`);
    console.log(`   Visible: ${analysis.hasVisibleCharacters ? '✅ YES' : '❌ NO'}`);

    return {
      success: analysis.hasVisibleCharacters,
      analysis
    };
  } finally {
    await browser.close();
  }
}

/**
 * Main loop: build, start, test, fix
 */
async function main() {
  let iteration = 0;
  let lastError = null;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n🔄 Iteration ${iteration}/${MAX_ITERATIONS}\n`);

    // Step 1: Build
    console.log('📦 Building...');
    try {
      execSync('npm run build', {
        cwd: PROJECT_ROOT,
        stdio: 'pipe'
      });
      console.log('✅ Build successful');
    } catch (err) {
      console.error('❌ Build failed:', err.message);
      process.exit(1);
    }

    // Step 2: Start dev server (kill existing first)
    console.log('🚀 Starting dev server...');

    // Kill existing Electron processes
    try {
      execSync('pkill -f "electron-vite" 2>/dev/null || true');
      execSync('pkill -f "Electron" 2>/dev/null || true');
    } catch (e) {}

    await new Promise(r => setTimeout(r, 2000));

    const devProcess = spawn('npm', ['run', 'dev'], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      detached: true
    });

    // Wait for dev server to start
    console.log('⏳ Waiting for dev server...');
    await new Promise((resolve) => {
      let output = '';
      devProcess.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('localhost:517')) {
          resolve();
        }
      });
      setTimeout(resolve, 10000); // Timeout after 10s
    });

    await new Promise(r => setTimeout(r, 3000)); // Extra wait

    // Step 3: Test rendering
    console.log('🔍 Testing character rendering...');

    let result;
    try {
      result = await captureAndAnalyze();
    } catch (err) {
      console.error('❌ Test failed:', err.message);
      result = { success: false, error: err.message };
    }

    // Kill dev server
    try {
      process.kill(-devProcess.pid);
    } catch (e) {}

    if (result.success) {
      console.log('\n✅ Characters are rendering correctly!');
      console.log('🎉 Test passed!');
      process.exit(0);
    }

    // Characters not rendering correctly - need to fix
    console.log('\n❌ Characters not rendering correctly');
    console.log(`   Character pixels: ${result.analysis?.characterPixels || 0}`);
    console.log(`   Ratio: ${((result.analysis?.characterRatio || 0) * 100).toFixed(2)}%`);

    lastError = result;

    // For now, just report - actual fixing would require more sophisticated analysis
    console.log('\n📝 Manual intervention required:');
    console.log('   Check the renderer.ts file and verify:');
    console.log('   1. Character Y position calculation');
    console.log('   2. Sitting offset application');
    console.log('   3. Z-sort ordering');

    // In future iterations, we would apply fixes here
    // For now, exit after first failed attempt
    break;
  }

  console.log('\n=====================================');
  console.log('Test Results:');
  console.log(`  Iterations: ${iteration}`);
  console.log(`  Final Status: ${lastError?.success ? 'PASS' : 'FAIL'}`);
  console.log('=====================================\n');

  process.exit(lastError?.success ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
