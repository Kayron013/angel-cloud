import * as dotenv from 'dotenv';

dotenv.config();

export const env = {
  DUCK_DNS_TOKEN: process.env.DUCK_DNS_TOKEN!,
  DUCK_DNS_DOMAIN: process.env.DUCK_DNS_DOMAIN!,
  N8N_PORT: process.env.N8N_PORT!,
  N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL!,
  SSH_PUBLIC_KEY: process.env.SSH_PUBLIC_KEY!,
  SSH_PRIVATE_KEY_PATH: process.env.SSH_PRIVATE_KEY_PATH!,
  VOLUME_MOUNT_POINT: '/opt/n8n-data',
  VOLUME_DEVICE: '/dev/oracleoci/oraclevdb',
};
