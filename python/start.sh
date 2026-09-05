#!/bin/bash
# WildGuard AI Engine Startup Script (Linux/Mac)

set -e
cd "$(dirname "$0")"

echo "========================================="
echo "  WildGuard AI Engine - Python Service  "
echo "========================================="
echo ""

# Create venv if not exists
if [ ! -d "venv" ]; then
    echo "[INFO] Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

# Install if needed
python -c "import fastapi" 2>/dev/null || {
    echo "[INFO] Installing dependencies..."
    pip install -r requirements.txt
}

echo ""
echo "[INFO] Starting AI Engine on http://localhost:8000"
echo "[INFO] API Docs at http://localhost:8000/docs"
echo ""

python main.py
