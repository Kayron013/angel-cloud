#!/bin/bash
set -e  # Exit on any error

# Ensure latest packages
dnf -y update

# Function to log messages
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Configure SELinux for containers
log "Configuring SELinux for containers..."
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ]; then
    log "SELinux is enforcing - setting to permissive for container compatibility"
    setenforce 0  # Immediate change to permissive mode
    # Make it persistent across reboots
    sed -i 's/^SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config
fi

# Install podman and dependencies with retry logic
log "Installing podman and dependencies..."
for i in {1..3}; do
    if dnf install -y podman; then
        log "Podman installed successfully"
        break
    else
        log "Attempt $i failed, retrying in 30 seconds..."
        sleep 30
    fi
done

# Ensure critical podman dependencies are present (this was the main issue)
log "Installing podman dependencies..."
dnf install -y crun conmon containers-common || true  # || true prevents script failure if already installed


# Install podman-compose
dnf install -y python3-pip
pip3 install podman-compose
log "podman-compose installed successfully"

# Add podman to PATH
export PATH="/usr/local/bin:$PATH"

# Enable and start podman socket
systemctl enable --now podman.socket

########################################################
##
## n8n Setup
##
########################################################

log "Starting n8n setup..."

# Create n8n app directory
mkdir -p /opt/n8n
cd /opt/n8n

# Write the compose file
cat <<'EOF' > docker-compose.yaml
__DOCKER_COMPOSE_CONTENT__
EOF

# Run the container
podman-compose up -d

# Allow n8n port
firewall-cmd --permanent --add-port=5678/tcp
firewall-cmd --reload

log "n8n setup completed successfully!"

########################################################
##
# DuckDNS Setup
##
########################################################

log "Setting up DuckDNS..."

mkdir /opt/duckdns
cd /opt/duckdns

# Write the duck.sh script
cat <<'EOF' > duck.sh
echo url="https://www.duckdns.org/update?domains=kayron013-n8n&token=__DUCK_DNS_TOKEN__&ip=" | curl -k -o ~/opt/duckdns/duck.log -K -
EOF

# Make the script executable
chmod 700 duck.sh

# Add to crontab
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/duckdns/duck.sh") | crontab -

# Run the script
/opt/duckdns/duck.sh

log "DuckDNS setup completed successfully!"
