#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
KOKO_PORT=8766  # Default koko websocket port (avoid conflict with frontend)
EARS_PORT=8765  # Default ears websocket port
FRONTEND_PORT=8080  # Vite frontend port

# Get the script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "Starting trnsltr services..."
echo ""

# Function to check if a port is in use
check_port() {
    local port=$1
    lsof -ti:$port > /dev/null 2>&1
    return $?
}

# Check and start kokorox websocket
echo -n "Checking kokorox websocket (port $KOKO_PORT)... "
if check_port $KOKO_PORT; then
    echo -e "${GREEN}already running${NC}"
else
    echo -e "${YELLOW}not running, starting...${NC}"
    nohup koko websocket --port $KOKO_PORT > /tmp/koko.log 2>&1 &
    sleep 2
    if check_port $KOKO_PORT; then
        echo -e "${GREEN}kokorox websocket started successfully${NC}"
    else
        echo -e "${RED}Failed to start kokorox websocket. Check /tmp/koko.log for details${NC}"
        exit 1
    fi
fi

# Check and start ears websocket server
echo -n "Checking ears websocket (port $EARS_PORT)... "
if check_port $EARS_PORT; then
    echo -e "${GREEN}already running${NC}"
else
    echo -e "${YELLOW}not running, starting...${NC}"
    ears server start
    sleep 2
    if check_port $EARS_PORT; then
        echo -e "${GREEN}ears server started successfully${NC}"
    else
        echo -e "${RED}Failed to start ears server. Check server logs with 'ears server status'${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}All backend services are running!${NC}"
echo ""
echo "Starting frontend on port $FRONTEND_PORT..."
echo ""

# Change to project root and start the frontend (this will run in the foreground)
cd "$PROJECT_ROOT"
bun dev
