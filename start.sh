#!/bin/bash

# Persofest'26 Start Script
# This script starts both backend and frontend servers

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ROOT_DIR="$(dirname "$0")"

echo "========================================="
echo "  Persofest'26 Start Script"
echo "========================================="

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down servers...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo -e "${GREEN}Servers stopped${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start Backend
echo -e "${BLUE}Starting Backend Server...${NC}"
cd "$ROOT_DIR/backend"

# Activate virtual environment
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
else
    echo -e "${RED}Virtual environment not found. Run ./setup.sh first.${NC}"
    exit 1
fi

# Start FastAPI server in background
uvicorn server:app --host 0.0.0.0 --port 8001 --reload &
BACKEND_PID=$!
echo -e "${GREEN}Backend started (PID: $BACKEND_PID) on http://localhost:8001${NC}"

# Wait for backend to start
sleep 3

# Check if backend is running
if ! curl -s http://localhost:8001/api/ > /dev/null; then
    echo -e "${RED}Backend failed to start. Check logs for errors.${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}Backend is healthy${NC}"

# Start Frontend
echo -e "${BLUE}Starting Frontend Server...${NC}"
cd "$ROOT_DIR/frontend"

# Start React dev server in background
if command -v yarn &> /dev/null; then
    yarn start &
else
    npm start &
fi
FRONTEND_PID=$!
echo -e "${GREEN}Frontend started (PID: $FRONTEND_PID) on http://localhost:3000${NC}"

echo ""
echo "========================================="
echo -e "${GREEN}  Persofest'26 is running!${NC}"
echo "========================================="
echo ""
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8001"
echo "  API Docs: http://localhost:8001/docs"
echo ""
echo "  Default Admin:"
echo "    Register Number: 0000000000"
echo "    Password: admin123"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
