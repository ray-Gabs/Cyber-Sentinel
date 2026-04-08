# ============================================================
# backend/Dockerfile — FastAPI Backend + Security Tools
# ============================================================
# Runs on Linux (Debian slim) inside Docker Desktop on Windows/macOS/Linux.
# All Linux-only tools (nmap, nuclei, whatweb) live here — no host OS deps.
# ============================================================

FROM python:3.11-slim

# Sane Python defaults for containers
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

# ---- System dependencies ----
# curl: reliable redirect-following downloads (replaces wget for GitHub releases)
# nmap: network scanner
# whatweb: web fingerprinting (Ruby-based, in Debian repos)
# libssl-dev, libffi-dev: required by sslyze/nassl to compile C extensions
# build-essential, pkg-config, libcairo2-dev: WeasyPrint / PDF report generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    nmap \
    whatweb \
    libssl-dev \
    libffi-dev \
    build-essential \
    libcairo2-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# ---- Nuclei (ProjectDiscovery vuln scanner) ----
# Pinned to a stable release — update ARG to bump version.
ARG NUCLEI_VERSION=3.3.9
RUN curl -fsSL \
    "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_amd64.zip" \
    -o /tmp/nuclei.zip \
    && unzip -j /tmp/nuclei.zip nuclei -d /usr/local/bin/ \
    && rm /tmp/nuclei.zip \
    && chmod +x /usr/local/bin/nuclei \
    && nuclei -update-templates -silent || true

# ---- Katana (web crawler — optional) ----
ARG KATANA_VERSION=1.1.0
RUN curl -fsSL \
    "https://github.com/projectdiscovery/katana/releases/download/v${KATANA_VERSION}/katana_${KATANA_VERSION}_linux_amd64.zip" \
    -o /tmp/katana.zip \
    && unzip -j /tmp/katana.zip katana -d /usr/local/bin/ \
    && rm /tmp/katana.zip \
    && chmod +x /usr/local/bin/katana \
    || echo "Katana install skipped (non-fatal)"

WORKDIR /app

# ---- Python dependencies (cached layer — only rebuilds when requirements change) ----
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# ---- Application code ----
# In dev (docker-compose), ./backend is volume-mounted over /app so this layer
# is overridden at runtime. In production builds (no volume), this is the source.
COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/api/health').raise_for_status()" || exit 1

# Dev default: --reload watches the volume-mounted source for changes.
# Override CMD in docker-compose for production: uvicorn main:app --host 0.0.0.0 --port 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
