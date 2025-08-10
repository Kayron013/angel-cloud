#!/bin/bash

########################################################
##
## DuckDNS Setup
##
########################################################

set -e  # Exit on any error

# Function to log messages
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log "Starting DuckDNS setup..."

mkdir -p /opt/duckdns
cd /opt/duckdns

# Write the duck.sh script
log "Creating DuckDNS update script..."
cat <<'EOF' > duck.sh
echo url="https://www.duckdns.org/update?domains=__DUCK_DNS_DOMAIN__&token=__DUCK_DNS_TOKEN__&ip=" | curl -k -o /opt/duckdns/duck.log -K -
EOF

# Make the script executable
chmod 700 duck.sh

# Add to crontab
log "Setting up DuckDNS cron job..."
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/duckdns/duck.sh") | crontab -

# Run the script
log "Running initial DuckDNS update..."
/opt/duckdns/duck.sh

log "DuckDNS setup completed successfully!"
