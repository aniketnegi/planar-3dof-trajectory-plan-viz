# --- Stage 1: Builder ---
FROM python:3.12-slim AS builder

# Install uv just for the build stage
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# Cache dependencies
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# Copy code and install the project
COPY . /app
RUN uv sync --frozen --no-dev

# --- Stage 2: Final Runtime ---
FROM python:3.12-slim

LABEL org.opencontainers.image.authors="Aniket Negi <aniket.negi19104@gmail.com>"

WORKDIR /app

# 1. Copy the isolated virtual environment from the builder stage
COPY --from=builder /app/.venv /app/.venv

# 2. Copy the application code from the builder stage
COPY --from=builder /app /app

ENV PATH="/app/.venv/bin:$PATH"

CMD ["fastapi", "run", "app/main.py", "--port", "80", "--host", "0.0.0.0"]
