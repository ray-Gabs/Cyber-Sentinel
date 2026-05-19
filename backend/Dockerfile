# ============================================================
# backend/Dockerfile — FastAPI Backend + Security Tools
# ============================================================
# Multi-stage build:
#   builder  — compiles Python C extensions + downloads Go binaries
#   runtime  — lean image, non-root user, no build toolchain
#
# Dev:  docker compose up  (volume-mounts source, uses --reload via compose)
# Prod: docker compose -f docker-compose.yml -f docker-compose.prod.yml up
# ============================================================

# ===== Stage 1: Builder =====
FROM python:3.11-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    libssl-dev \
    libffi-dev \
    build-essential \
    pkg-config \
    libcairo2-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages into an isolated prefix for clean COPY
COPY requirements.txt /build/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --prefix=/install -r /build/requirements.txt

# Nuclei (ProjectDiscovery vuln scanner)
# To upgrade: --build-arg NUCLEI_VERSION=<latest> at docker build time
ARG NUCLEI_VERSION=3.8.0
RUN curl -fsSL \
    "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_amd64.zip" \
    -o /tmp/nuclei.zip \
    && unzip -j /tmp/nuclei.zip nuclei -d /usr/local/bin/ \
    && rm /tmp/nuclei.zip \
    && chmod +x /usr/local/bin/nuclei

# Katana (web crawler — optional, non-fatal)
ARG KATANA_VERSION=1.6.1
RUN curl -fsSL \
    "https://github.com/projectdiscovery/katana/releases/download/v${KATANA_VERSION}/katana_${KATANA_VERSION}_linux_amd64.zip" \
    -o /tmp/katana.zip \
    && unzip -j /tmp/katana.zip katana -d /usr/local/bin/ \
    && rm /tmp/katana.zip \
    && chmod +x /usr/local/bin/katana \
    || echo "Katana install skipped (non-fatal)"


# ===== Stage 2: Runtime =====
FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    NUCLEI_TEMPLATES=/home/sentinel/nuclei-templates

# Runtime system deps only — no build toolchain
# libssl3 + libffi8: runtime .so files needed by sslyze/nassl
# fonts-liberation: fallback fonts for headless Chromium PDF generation
# nmap + whatweb: security scanners
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    nmap \
    whatweb \
    libssl3 \
    libffi8 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Python packages compiled in builder
COPY --from=builder /install /usr/local

# Go binaries compiled in builder
COPY --from=builder /usr/local/bin/nuclei /usr/local/bin/nuclei
COPY --from=builder /usr/local/bin/katana /usr/local/bin/katana

# Playwright Chromium for PDF generation — installed as root so the binary
# is accessible to all users; PLAYWRIGHT_BROWSERS_PATH makes the path explicit.
# Pre-clean apt cache so --with-deps has enough space in /var/cache/apt/archives/.
# Non-fatal (|| true): if disk is still tight the build succeeds and PDF export
# degrades gracefully — the router already handles ImportError/PlaywrightError.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN apt-get clean && rm -rf /var/cache/apt/archives/*.deb /var/lib/apt/lists/* \
    && ( playwright install --with-deps chromium \
         && chmod -R 755 /opt/playwright \
       ) \
    || echo "WARNING: Playwright Chromium install failed — PDF export will be unavailable"

# Non-root user — least privilege for production
RUN useradd -m -u 1000 -s /bin/bash sentinel

WORKDIR /app

# Application source (overridden by volume mount in dev compose)
COPY --chown=sentinel:sentinel . .

# Nuclei template dir writable by the non-root user
RUN mkdir -p /home/sentinel/nuclei-templates \
    && chown -R sentinel:sentinel /home/sentinel

USER sentinel

# Pre-download Nuclei templates at build time so the first scan doesn't need
# internet access. -duc suppresses the "binary outdated" version-check noise.
# Non-fatal: || true ensures air-gapped builds succeed; templates auto-download on first scan.
# Note: no pipe — piping steals nuclei's exit code and breaks the verification check.
RUN nuclei -update-templates -duc || true; \
    if [ -d /home/sentinel/nuclei-templates ] && [ "$(ls -A /home/sentinel/nuclei-templates 2>/dev/null)" ]; then \
      echo "nuclei: templates downloaded OK at ~/nuclei-templates"; \
    elif [ -d /home/sentinel/.local/share/nuclei/templates ] && [ "$(ls -A /home/sentinel/.local/share/nuclei/templates 2>/dev/null)" ]; then \
      echo "nuclei: templates downloaded OK at XDG path"; \
    else \
      echo "nuclei: WARNING — templates empty, will retry on first scan"; \
    fi

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/api/health').raise_for_status()" || exit 1

# Production: 4 workers, no hot-reload
# Dev: docker-compose.yml overrides with --reload via source volume mount
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
