#!/bin/bash
#
# Restore the Postgres database in the docker-compose stack from a pg_dump
# custom-format dump file.
#
# Usage:
#   ./restore_db.sh <path-to-dump-file>
#
# Example:
#   ./restore_db.sh backup/persofest_db_snapshot_20260604_180001.dump
#
# Requires: the docker-compose stack must already be running
# (docker compose up -d) so the postgres container exists.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PG_CONTAINER="pf26-postgres"
BACKEND_CONTAINER="pf26-backend"
DB_NAME="mydb"
DB_USER="admin"
DB_PASS="admin123"

if [ -z "$1" ]; then
    echo -e "${RED}Error: dump file path is required${NC}"
    echo "Usage: $0 <path-to-dump-file>"
    exit 1
fi

DUMP_FILE="$1"

if [ ! -f "$DUMP_FILE" ]; then
    echo -e "${RED}Error: file not found: $DUMP_FILE${NC}"
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
    echo -e "${RED}Error: container '${PG_CONTAINER}' is not running${NC}"
    echo "Start the stack first: docker compose up -d"
    exit 1
fi

echo -e "${YELLOW}This will DROP and recreate database '${DB_NAME}' and restore from:${NC}"
echo "  $DUMP_FILE"
read -p "Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

if docker ps --format '{{.Names}}' | grep -q "^${BACKEND_CONTAINER}$"; then
    echo -e "${YELLOW}Stopping backend to free DB connections...${NC}"
    docker compose stop backend
    BACKEND_WAS_RUNNING=1
else
    BACKEND_WAS_RUNNING=0
fi

echo -e "${YELLOW}Terminating any remaining connections to ${DB_NAME}...${NC}"
docker exec -e PGPASSWORD=${DB_PASS} ${PG_CONTAINER} \
    psql -U ${DB_USER} -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid<>pg_backend_pid();" \
    > /dev/null

echo -e "${YELLOW}Dropping database ${DB_NAME}...${NC}"
docker exec -e PGPASSWORD=${DB_PASS} ${PG_CONTAINER} \
    psql -U ${DB_USER} -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"

echo -e "${YELLOW}Creating database ${DB_NAME}...${NC}"
docker exec -e PGPASSWORD=${DB_PASS} ${PG_CONTAINER} \
    psql -U ${DB_USER} -d postgres -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

echo -e "${YELLOW}Copying dump into container...${NC}"
docker cp "$DUMP_FILE" ${PG_CONTAINER}:/tmp/restore.dump

echo -e "${YELLOW}Restoring (this may take a minute)...${NC}"
docker exec -e PGPASSWORD=${DB_PASS} ${PG_CONTAINER} \
    pg_restore -U ${DB_USER} -d ${DB_NAME} --no-owner --no-privileges /tmp/restore.dump

docker exec ${PG_CONTAINER} rm -f /tmp/restore.dump

if [ "$BACKEND_WAS_RUNNING" -eq 1 ]; then
    echo -e "${YELLOW}Restarting backend...${NC}"
    docker compose start backend
fi

echo -e "${GREEN}Restore complete.${NC}"
