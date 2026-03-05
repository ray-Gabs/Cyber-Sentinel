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

# Install Nuclei binary
RUN wget -q https://github.com/projectdiscovery/nuclei/releases/latest/download/nuclei_linux_amd64.zip \
    && unzip nuclei_linux_amd64.zip -d /usr/local/bin/ \
    && rm nuclei_linux_amd64.zip \
    && nuclei -update-templates || true

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
