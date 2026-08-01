#!/bin/bash
# PF26 environment setup — Ubuntu / WSL / macOS
# Checks required tool versions and installs/upgrades what's missing.
#
# Required versions:
#   Python   3.11+
#   pip      23+
#   Node     24+
#   npm      10+
#   Docker   24+
#   Docker Compose plugin  2.20+

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  OK   $1${NC}"; }
warn() { echo -e "${YELLOW}  WARN $1${NC}"; }
fail() { echo -e "${RED}  FAIL $1${NC}"; }
info() { echo -e "${BLUE}  >>>  $1${NC}"; }

echo ""
echo "========================================="
echo "  PF26 Environment Check & Setup"
echo "========================================="
echo ""

ERRORS=0

# ── Python 3.11+ ──────────────────────────────────────────────────────────────
info "Checking Python..."
if command -v python3 &>/dev/null; then
    PY_VER=$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')
    if python3 -c 'import sys; exit(0 if sys.version_info >= (3,11) else 1)'; then
        ok "Python $PY_VER"
    else
        warn "Python $PY_VER found but 3.11+ required. Installing via deadsnakes PPA..."
        if command -v apt-get &>/dev/null; then
            sudo apt-get update -qq
            sudo apt-get install -y software-properties-common
            sudo add-apt-repository -y ppa:deadsnakes/ppa
            sudo apt-get update -qq
            sudo apt-get install -y python3.11 python3.11-venv python3.11-dev
            ok "Python 3.11 installed"
        else
            fail "Cannot auto-install Python on this OS. Install Python 3.11+ manually."
            ERRORS=$((ERRORS+1))
        fi
    fi
else
    warn "Python3 not found. Installing..."
    if command -v apt-get &>/dev/null; then
        sudo apt-get update -qq
        sudo apt-get install -y software-properties-common
        sudo add-apt-repository -y ppa:deadsnakes/ppa
        sudo apt-get update -qq
        sudo apt-get install -y python3.11 python3.11-venv python3.11-dev
        ok "Python 3.11 installed"
    else
        fail "Cannot auto-install Python on this OS. Install Python 3.11+ manually."
        ERRORS=$((ERRORS+1))
    fi
fi

# ── pip 23+ ───────────────────────────────────────────────────────────────────
info "Checking pip..."
if command -v pip3 &>/dev/null; then
    PIP_VER=$(pip3 --version | awk '{print $2}')
    PIP_MAJOR=$(echo $PIP_VER | cut -d. -f1)
    if [ "$PIP_MAJOR" -ge 23 ]; then
        ok "pip $PIP_VER"
    else
        warn "pip $PIP_VER found, upgrading..."
        python3 -m pip install --upgrade pip
        ok "pip upgraded"
    fi
else
    warn "pip not found, installing..."
    python3 -m ensurepip --upgrade || sudo apt-get install -y python3-pip
    ok "pip installed"
fi

# ── Node 24+ ──────────────────────────────────────────────────────────────────
info "Checking Node.js..."
if command -v node &>/dev/null; then
    NODE_VER=$(node -v | sed 's/v//')
    NODE_MAJOR=$(echo $NODE_VER | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 24 ]; then
        ok "Node $NODE_VER"
    else
        warn "Node $NODE_VER found but 24+ required. Upgrading via nvm or nodesource..."
        if command -v nvm &>/dev/null; then
            nvm install 24 && nvm use 24 && nvm alias default 24
            ok "Node 24 installed via nvm"
        elif command -v apt-get &>/dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ok "Node 24 installed via nodesource"
        else
            fail "Cannot auto-upgrade Node on this OS. Install Node 24+ manually."
            ERRORS=$((ERRORS+1))
        fi
    fi
else
    warn "Node not found. Installing Node 24..."
    if command -v apt-get &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
        sudo apt-get install -y nodejs
        ok "Node 24 installed"
    else
        fail "Cannot auto-install Node on this OS. Install Node 24+ manually."
        ERRORS=$((ERRORS+1))
    fi
fi

# ── npm 10+ ───────────────────────────────────────────────────────────────────
info "Checking npm..."
if command -v npm &>/dev/null; then
    NPM_VER=$(npm -v)
    NPM_MAJOR=$(echo $NPM_VER | cut -d. -f1)
    if [ "$NPM_MAJOR" -ge 10 ]; then
        ok "npm $NPM_VER"
    else
        warn "npm $NPM_VER found, upgrading..."
        npm install -g npm@latest
        ok "npm upgraded to $(npm -v)"
    fi
else
    fail "npm not found (should have been installed with Node)."
    ERRORS=$((ERRORS+1))
fi

# ── Docker 24+ ────────────────────────────────────────────────────────────────
info "Checking Docker..."
if command -v docker &>/dev/null; then
    DOCKER_VER=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "0.0")
    DOCKER_MAJOR=$(echo $DOCKER_VER | cut -d. -f1)
    if [ "$DOCKER_MAJOR" -ge 24 ]; then
        ok "Docker $DOCKER_VER"
    else
        warn "Docker $DOCKER_VER found but 24+ recommended."
        warn "Upgrade: https://docs.docker.com/engine/install/ubuntu/"
    fi
else
    warn "Docker not found. Installing..."
    if command -v apt-get &>/dev/null; then
        curl -fsSL https://get.docker.com | sudo sh
        sudo usermod -aG docker $USER
        ok "Docker installed. Log out and back in for group changes to take effect."
    else
        fail "Cannot auto-install Docker on this OS. Install manually."
        ERRORS=$((ERRORS+1))
    fi
fi

# ── GitHub CLI ────────────────────────────────────────────────────────────────
info "Checking GitHub CLI..."
if command -v gh &>/dev/null; then
    ok "gh $(gh --version | head -1 | awk '{print $3}')"
else
    warn "gh not found. Installing..."
    if command -v apt-get &>/dev/null; then
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list
        sudo apt-get update -qq
        sudo apt-get install -y gh
        ok "gh installed"
    else
        fail "Cannot auto-install gh on this OS. Install from https://cli.github.com"
        ERRORS=$((ERRORS+1))
    fi
fi

# ── Docker Compose v2.20+ ─────────────────────────────────────────────────────
info "Checking Docker Compose..."
if docker compose version &>/dev/null; then
    COMPOSE_VER=$(docker compose version --short 2>/dev/null || docker compose version | awk '{print $NF}')
    ok "Docker Compose $COMPOSE_VER"
else
    fail "Docker Compose plugin not found. Install Docker Desktop or the compose plugin."
    fail "Ubuntu: sudo apt-get install docker-compose-plugin"
    ERRORS=$((ERRORS+1))
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "========================================="
if [ "$ERRORS" -eq 0 ]; then
    echo -e "${GREEN}  All checks passed.${NC}"
    echo ""
    echo "  Next steps for a fresh local setup:"
    echo "    1. Copy backend/.env and set credentials"
    echo "    2. docker compose up -d postgres"
    echo "    3. cd backend && python3 -m venv venv && source venv/bin/activate"
    echo "    4. pip install -r requirements.txt"
    echo "    5. python scripts/init_schema.py"
    echo "    6. cd ../frontend && npm ci && npm run dev"
else
    echo -e "${RED}  $ERRORS issue(s) found. Fix them before running the app.${NC}"
fi
echo "========================================="
echo ""

echo "Current versions:"
echo "  Python:  $(python3 --version 2>/dev/null || echo 'not found')"
echo "  pip:     $(pip3 --version 2>/dev/null | awk '{print $1,$2}' || echo 'not found')"
echo "  Node:    $(node -v 2>/dev/null || echo 'not found')"
echo "  npm:     $(npm -v 2>/dev/null || echo 'not found')"
echo "  Docker:  $(docker --version 2>/dev/null || echo 'not found')"
echo "  Compose: $(docker compose version 2>/dev/null || echo 'not found')"
echo "  gh:      $(gh --version 2>/dev/null | head -1 || echo 'not found')"
echo ""
