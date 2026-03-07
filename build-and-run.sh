#!/bin/bash

# Pixel Agents Electron - 构建并运行脚本
# 用于快速重新构建和启动开发服务器

set -e

echo "======================================"
echo "  Pixel Agents Electron - 构建并运行"
echo "======================================"
echo ""

# 清理旧的构建产物
echo "🧹 清理旧的构建产物..."
rm -rf dist/

# 安装依赖（如果需要）
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 构建项目
echo "🔨 构建项目..."
npm run build

echo ""
echo "✅ 构建完成！"
echo ""
echo "🚀 启动开发服务器..."
echo "======================================"
echo ""

# 启动开发服务器
npm run dev
