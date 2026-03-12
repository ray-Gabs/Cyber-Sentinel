# ============================================================
# backend/Dockerfile — FastAPI Backend Container
# ============================================================
FROM python:3.11-slim

# Install system dependencies (Nmap, WhatWeb, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    nmap \
    whatweb \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Nuclei binary (ProjectDiscovery)
RUN wget -q https://github.com/projectdiscovery/nuclei/releases/latest/download/nuclei_linux_amd64.zip \
    && unzip nuclei_linux_amd64.zip -d /usr/local/bin/ \
    && rm nuclei_linux_amd64.zip \
    && nuclei -update-templates || true

# Install Katana binary (ProjectDiscovery web crawler)
RUN wget -q https://github.com/projectdiscovery/katana/releases/latest/download/katana_linux_amd64.zip \
    && unzip katana_linux_amd64.zip -d /usr/local/bin/ \
    && rm katana_linux_amd64.zip

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/api/health').raise_for_status()" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
