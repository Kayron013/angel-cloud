#!/bin/bash

########################################################
##
## n8n Deployment
##
########################################################

set -e  # Exit on any error

# Function to log messages
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log "Starting n8n deployment..."

# Create n8n app directory
mkdir -p /opt/n8n
cd /opt/n8n

# Write the compose file
log "Creating docker-compose.yaml..."
cat <<'EOF' > docker-compose.yaml
__DOCKER_COMPOSE_CONTENT__
EOF

# Run the container
log "Starting n8n container..."
/usr/local/bin/podman-compose up -d

# Allow n8n port
log "Configuring firewall for n8n..."
firewall-cmd --permanent --add-port=5678/tcp
firewall-cmd --reload

log "n8n deployment completed successfully!"
