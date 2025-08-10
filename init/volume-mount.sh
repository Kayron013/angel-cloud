#!/bin/bash

########################################################
##
## Volume Setup
##
########################################################

set -e  # Exit on any error

# Function to log messages
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log "Starting volume setup..."

DEVICE=__DEVICE__
MOUNT_POINT=__MOUNT_POINT__

# Wait for the device to appear (up to ~2 min)
log "Waiting for volume device to appear..."
for _ in $(seq 1 60); do
  [ -e "$DEVICE" ] && break
  sleep 2
done
if [ ! -e "$DEVICE" ]; then
  log "ERROR: Device $DEVICE not found" >&2
  exit 1
fi

log "Volume device found: $DEVICE"

# Format if not already formatted
if ! blkid -o value -s TYPE "$DEVICE" >/dev/null 2>&1; then
  log "Formatting volume with XFS filesystem..."
  mkfs.xfs -f "$DEVICE"
else
  log "Volume already formatted"
fi

# Mount and persist via UUID
log "Setting up volume mount..."
mkdir -p "$MOUNT_POINT"
UUID=$(blkid -s UUID -o value "$DEVICE")
if ! grep -q "UUID=$UUID " /etc/fstab; then
  log "Adding volume to fstab..."
  echo "UUID=$UUID $MOUNT_POINT xfs defaults,nofail 0 2" >> /etc/fstab
else
  log "Volume already in fstab"
fi

# Mount the volume
log "Mounting volume..."
mount -a

# Ensure proper permissions for n8n data directory
log "Setting up permissions..."
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

log "Volume setup completed successfully!"
