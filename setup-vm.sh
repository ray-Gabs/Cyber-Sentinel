#!/bin/bash
# ============================================================
# Cyber Sentinel — VM Setup Script (Ubuntu/Debian)
# ============================================================
# Run this on a fresh VM:
#   chmod +x setup-vm.sh
#   ./setup-vm.sh
# ============================================================

set -e  # Stop on any error

echo "=========================================="
echo "  Cyber Sentinel — VM Setup"
echo "=========================================="

# --- 1. System Updates ---
echo "[1/7] Updating system packages..."
sudo apt update && sudo apt upgrade -y

# --- 2. Install Python 3.11+ ---
echo "[2/7] Installing Python..."
sudo apt install -y python3 python3-pip python3-venv

# --- 3. Install Node.js 20 ---
echo "[3/7] Installing Node.js 20..."
# Using NodeSource repo for latest Node
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# --- 4. Install Docker ---
echo "[4/7] Installing Docker..."
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Let current user run docker without sudo
sudo usermod -aG docker $USER

# --- 5. Install Security Tools (optional but recommended) ---
echo "[5/7] Installing security tools..."
sudo apt install -y nmap

# Install Nuclei
echo "  Installing Nuclei..."
NUCLEI_VERSION=$(curl -s https://api.github.com/repos/projectdiscovery/nuclei/releases/latest | grep tag_name | cut -d '"' -f 4 | sed 's/v//')
wget -q "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_amd64.zip" -O /tmp/nuclei.zip
sudo apt install -y unzip
unzip -o /tmp/nuclei.zip -d /tmp/
sudo mv /tmp/nuclei /usr/local/bin/
rm /tmp/nuclei.zip

# --- 6. Install Git ---
echo "[6/7] Installing Git..."
sudo apt install -y git

# --- 7. Clone & Setup Project ---
echo "[7/7] Setting up Cyber Sentinel..."
if [ ! -d "Cyber-Sentinel" ]; then
    git clone https://github.com/ray-Gabs/Cyber-Sentinel.git
fi
cd Cyber-Sentinel

# Create .env from example
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo ""
    echo "  >> IMPORTANT: Edit .env to add your GEMINI_API_KEY and JWT_SECRET"
    echo "  >> Run: nano .env"
    echo ""
fi

# Start Docker containers (need newgrp for docker access)
echo "Starting MongoDB & Redis..."
sudo docker compose up -d

# Setup Backend
echo "Setting up backend..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
cd ..

# Setup Frontend
echo "Setting up frontend..."
cd frontend
npm install
cd ..

echo ""
echo "=========================================="
echo "  SETUP COMPLETE!"
echo "=========================================="
echo ""
echo "  NEXT STEPS:"
echo ""
echo "  1. Edit .env file:"
echo "     nano .env"
echo "     (set JWT_SECRET and GEMINI_API_KEY)"
echo ""
echo "  2. Start the backend:"
echo "     cd backend"
echo "     source venv/bin/activate"
echo "     uvicorn main:app --reload --host 0.0.0.0 --port 8000"
echo ""
echo "  3. Start the frontend (new terminal):"
echo "     cd frontend"
echo "     npm run dev -- --host 0.0.0.0"
echo ""
echo "  4. Start Celery worker (new terminal):"
echo "     cd backend && source venv/bin/activate"
echo "     celery -A core.celery_app worker --loglevel=info"
echo ""
echo "  NOTE: Use --host 0.0.0.0 so you can"
echo "  access from your local machine via VM's IP."
echo ""
echo "  Backend: http://<VM-IP>:8000/docs"
echo "  Frontend: http://<VM-IP>:5173"
echo "=========================================="
