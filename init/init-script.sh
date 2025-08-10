#!/bin/bash

########################################################
##
## General Setup
##
########################################################

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
## Attach Volume
##
########################################################

DEVICE=/dev/oracleoci/oraclevdb
MOUNT_POINT=/opt/n8n-data

# Wait for the device to appear (up to ~2 min)
for _ in $(seq 1 60); do
  [ -e "$DEVICE" ] && break
  sleep 2
done
if [ ! -e "$DEVICE" ]; then
  echo "Device $DEVICE not found" >&2
  exit 1
fi

# Format if not already formatted
if ! blkid -o value -s TYPE "$DEVICE" >/dev/null 2>&1; then
  mkfs.xfs -f "$DEVICE"
fi

# Mount and persist via UUID
mkdir -p "$MOUNT_POINT"
UUID=$(blkid -s UUID -o value "$DEVICE")
if ! grep -q "UUID=$UUID " /etc/fstab; then
  echo "UUID=$UUID $MOUNT_POINT xfs defaults,nofail 0 2" >> /etc/fstab
fi
mount -a

# Ensure proper permissions for n8n data directory
chown -R 1000:1000 "$MOUNT_POINT"  # n8n runs as user 1000
chmod -R 755 "$MOUNT_POINT"

# Check if n8n data already exists and preserve it
if [ -d "$MOUNT_POINT/.n8n" ]; then
    log "Existing n8n data found, preserving..."
    # Ensure the data is owned by the n8n user
    chown -R 1000:1000 "$MOUNT_POINT/.n8n"
else
    log "No existing n8n data found, will create fresh installation"
fi

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
echo url="https://www.duckdns.org/update?domains=kayron013-n8n&token=__DUCK_DNS_TOKEN__&ip=" | curl -k -o /opt/duckdns/duck.log -K -
EOF

# Make the script executable
chmod 700 duck.sh

# Add to crontab
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/duckdns/duck.sh") | crontab -

# Run the script
/opt/duckdns/duck.sh

log "DuckDNS setup completed successfully!"
