import * as dotenv from 'dotenv';

dotenv.config();

export const env = {
  DUCK_DNS_TOKEN: process.env.DUCK_DNS_TOKEN!,
  N8N_PORT: process.env.N8N_PORT!,
  N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL!,
  SSH_PUBLIC_KEY: process.env.SSH_PUBLIC_KEY!,
  SSH_PRIVATE_KEY_PATH: process.env.SSH_PRIVATE_KEY_PATH!,
};
