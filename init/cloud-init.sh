#!/bin/bash

########################################################
##
## System Setup (Cloud-init)
##
########################################################

set -e  # Exit on any error

# Function to log messages
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log "Starting system setup..."

# Ensure latest packages
log "Updating system packages..."
dnf -y update

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

# Ensure critical podman dependencies are present
log "Installing podman dependencies..."
dnf install -y crun conmon containers-common || true

# Install podman-compose
log "Installing podman-compose..."
dnf install -y python3-pip
pip3 install podman-compose
log "podman-compose installed successfully"

# Add podman to PATH
export PATH="/usr/local/bin:$PATH"

# Enable and start podman socket
log "Enabling podman socket..."
systemctl enable --now podman.socket

log "System setup completed successfully!"
