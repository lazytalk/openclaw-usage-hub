#!/bin/bash

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}OpenClaw Usage Hub - Docker Deployment Script${NC}"
echo "=================================================="
echo ""

# Check Docker is installed
if ! command -v docker &> /dev/null; then
  echo -e "${RED}Error: Docker is not installed${NC}"
  exit 1
fi

if ! command -v docker-compose &> /dev/null; then
  echo -e "${RED}Error: docker-compose is not installed${NC}"
  exit 1
fi

echo -e "${YELLOW}Step 1: Loading environment variables...${NC}"
if [ ! -f .env ]; then
  echo -e "${RED}Error: .env file not found${NC}"
  echo "Please create a .env file based on .env.example"
  exit 1
fi

set -a
source .env
set +a

echo -e "${GREEN}✓ Environment loaded${NC}"

echo ""
echo -e "${YELLOW}Step 2: Building Docker image...${NC}"
docker-compose build

echo -e "${GREEN}✓ Build complete${NC}"

echo ""
echo -e "${YELLOW}Step 3: Starting services...${NC}"
docker-compose up -d

echo -e "${GREEN}✓ Services started${NC}"

echo ""
echo -e "${YELLOW}Step 4: Waiting for services to be healthy...${NC}"
sleep 5

# Check hub health
echo "Checking hub health..."
for i in {1..30}; do
  if docker-compose exec -T hub wget --quiet --tries=1 --spider http://localhost:3000/api/health 2>/dev/null; then
    echo -e "${GREEN}✓ Hub is healthy${NC}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${RED}Error: Hub failed to become healthy${NC}"
    exit 1
  fi
  echo "Waiting... ($i/30)"
  sleep 1
done

echo ""
echo -e "${GREEN}=================================================="
echo "✓ Deployment successful!"
echo "=================================================${NC}"
echo ""
echo "Hub is running at: http://localhost:${HUB_PORT:-3000}"
echo "PostgreSQL is running on: localhost:${POSTGRES_PORT:-5432}"
echo ""
echo "Next steps:"
echo "1. Access the admin dashboard at http://localhost:${HUB_PORT:-3000}/admin"
echo "2. Log in with username: ${ADMIN_USERNAME:-admin}"
echo "3. Configure the plugin mirror in OpenClaw:"
echo "   - url: http://your-host:${HUB_PORT:-3000}/api/v1/usage-events"
echo "   - apiKey: (from INGEST_API_KEY)"
echo ""
echo "Useful commands:"
echo "  docker-compose logs -f hub      # View hub logs"
echo "  docker-compose logs -f postgres # View database logs"
echo "  docker-compose down             # Stop all services"
echo "  docker-compose restart          # Restart services"
