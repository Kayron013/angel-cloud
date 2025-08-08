import * as dotenv from 'dotenv';

dotenv.config();

export const env = {
  DUCK_DNS_TOKEN: process.env.DUCK_DNS_TOKEN!,
  N8N_HOST: process.env.N8N_HOST!,
};
