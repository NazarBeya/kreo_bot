#!/bin/bash

# Creative Bot - Initial Setup Script
# This script helps set up the development environment

set -e

echo "🚀 Creative Bot - Initial Setup"
echo "================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

echo "✅ Docker found"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your Telegram bot token"
    echo ""
    echo "Get your bot token from @BotFather on Telegram:"
    echo "  1. Open Telegram and find @BotFather"
    echo "  2. Send /start"
    echo "  3. Send /newbot and follow prompts"
    echo "  4. Copy the token to .env as TELEGRAM_BOT_TOKEN"
    echo ""
    exit 0
fi

echo "✅ .env file exists"

# Check if node_modules exists in backend
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    # We'll let Docker handle this, but could do pre-install here
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env and add your Telegram bot token"
echo "  2. Run: npm run dev"
echo "  3. Wait for services to start (30 seconds)"
echo "  4. Open http://localhost:3001 in your browser"
echo ""
