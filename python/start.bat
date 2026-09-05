@echo off
echo =========================================
echo   WildGuard AI Engine - Python Service
echo =========================================
echo.

cd /d "%~dp0"

:: Check if virtual environment exists
if not exist "venv" (
    echo [INFO] Creating virtual environment...
    python -m venv venv
    echo [OK] Virtual environment created.
)

:: Activate virtual environment
call venv\Scripts\activate

:: Check if requirements are installed
python -c "import fastapi" 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Installing dependencies...
    pip install -r requirements.txt
    echo [OK] Dependencies installed.
)

echo.
echo [INFO] Starting AI Engine on http://localhost:8000
echo [INFO] API Docs at http://localhost:8000/docs
echo.

python main.py

pause
