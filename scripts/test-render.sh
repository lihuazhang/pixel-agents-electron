#!/bin/bash
# Character render testing script
# Launches app, waits for render, takes screenshot, and analyzes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SNAPSHOTS_DIR="$PROJECT_ROOT/snapshots"

mkdir -p "$SNAPSHOTS_DIR"

echo "🧪 Starting character render test..."

# Step 1: Build
echo "📦 Building project..."
cd "$PROJECT_ROOT"
npm run build

# Step 2: Kill any existing Electron processes
echo "🔧 Cleaning up existing processes..."
pkill -f "Electron" 2>/dev/null || true
sleep 1

# Step 3: Start Electron app in background
echo "🚀 Starting Electron app..."
npm run dev > /tmp/electron-dev.log 2>&1 &
ELECTRON_PID=$!

# Wait for app to start
echo "⏳ Waiting for app to initialize..."
sleep 8

# Step 4: Find the Electron window and take screenshot
echo "📸 Taking screenshot..."

# Use AppleScript to find Electron window and screenshot it
osascript <<EOF
tell application "System Events"
    if exists (processes where name is "Electron") then
        set electronProc to first process where name is "Electron"
        -- Get window position and size
        set win to first window of electronProc
        set winPos to position of win
        set winSize to size of win
        -- Take screenshot of window area
        do shell script "screencapture -x -R " & (item 1 of winPos as string) & "," & (item 2 of winPos as string) & "," & (item 1 of winSize as string) & "," & (item 2 of winSize as string) & " '$SNAPSHOTS_DIR/electron-window.png'"
    end if
end tell
EOF

echo "✅ Screenshot saved to $SNAPSHOTS_DIR/electron-window.png"

# Step 5: Cleanup
echo "🔧 Stopping Electron..."
kill $ELECTRON_PID 2>/dev/null || true

echo ""
echo "=================================="
echo "Test complete!"
echo "Screenshot: $SNAPSHOTS_DIR/electron-window.png"
echo "=================================="
echo ""
echo "Please check the screenshot to verify character rendering."
echo "Characters should be visible standing on the floor tiles,"
echo "not buried inside furniture or floating."
