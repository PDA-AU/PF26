#!/bin/bash

# Persofest'26 Setup Script
# This script sets up the development environment

set -e

echo "========================================="
echo "  Persofest'26 Setup Script"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Python version
echo -e "${YELLOW}Checking Python version...${NC}"
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
    echo -e "${GREEN}Python $PYTHON_VERSION found${NC}"
    
    # Check if version is >= 3.10
    if python3 -c 'import sys; exit(0 if sys.version_info >= (3, 10) else 1)'; then
        echo -e "${GREEN}Python version is compatible${NC}"
    else
        echo -e "${RED}Python 3.10 or higher is required${NC}"
        exit 1
    fi
else
    echo -e "${RED}Python 3 is not installed. Please install Python 3.10 or higher.${NC}"
    exit 1
fi

# Check Node.js
echo -e "${YELLOW}Checking Node.js...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}Node.js $NODE_VERSION found${NC}"
else
    echo -e "${RED}Node.js is not installed. Please install Node.js 18 or higher.${NC}"
    exit 1
fi

# Check PostgreSQL connection (optional)
echo -e "${YELLOW}Checking PostgreSQL...${NC}"
if command -v psql &> /dev/null; then
    echo -e "${GREEN}PostgreSQL client found${NC}"
else
    echo -e "${YELLOW}PostgreSQL client not found. Make sure you have database access configured in .env${NC}"
fi

# Setup Backend
echo ""
echo -e "${YELLOW}Setting up Backend...${NC}"
cd "$(dirname "$0")/backend"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install Python dependencies
echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating backend .env file..."
    cat > .env << 'EOF'
MONGO_URL="mongodb://localhost:27017"
DB_NAME="test_database"
CORS_ORIGINS="*"
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=persofest
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/persofest
JWT_SECRET_KEY=your_secret_key_change_in_production
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
UPLOAD_DIR=/app/backend/uploads
EOF
    echo -e "${YELLOW}Please update backend/.env with your database credentials${NC}"
fi

# Create uploads directory
mkdir -p uploads

# Initialize database tables
echo "Initializing database tables..."
python3 -c "
from database import engine, Base
from models import User, Round, Score, SystemConfig
Base.metadata.create_all(bind=engine)
print('Database tables created successfully!')
" 2>/dev/null || echo -e "${YELLOW}Database initialization skipped (check connection settings)${NC}"

deactivate

# Setup Frontend
echo ""
echo -e "${YELLOW}Setting up Frontend...${NC}"
cd ../frontend

# Install Node dependencies
echo "Installing Node.js dependencies..."
if command -v yarn &> /dev/null; then
    yarn install
else
    npm install
fi

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating frontend .env file..."
    cat > .env << 'EOF'
REACT_APP_BACKEND_URL=http://localhost:8001
WDS_SOCKET_PORT=443
ENABLE_HEALTH_CHECK=false
EOF
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "To start the application, run: ./start.sh"
echo ""
echo "Default Admin Credentials:"
echo "  Register Number: 0000000000"
echo "  Password: admin123"
echo ""
