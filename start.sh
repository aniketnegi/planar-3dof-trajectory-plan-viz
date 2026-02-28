#!/usr/bin/env bash

FORCE_FLAG=""
if [ "$2" = "--force" ] || [ "$2" = "-f" ]; then
    echo "forcing container recreation..."
    FORCE_FLAG="--force-recreate"
fi

if [ "$1" = "dev" ]; then
    echo "starting dev env ..."
    echo "Press Ctrl+C to stop."
    docker compose -f docker-compose.dev.yml up --build $FORCE_FLAG

elif [ "$1" = "prod" ]; then
    echo "starting prod (detached mode)..."
    docker compose -f docker-compose.prod.yml up --build -d $FORCE_FLAG
    echo "prod services are running in the bg."

else
    echo "Invalid argument."
    echo "Usage: ./start.sh [dev|prod] [--force|-f]"
    exit 1
fi
