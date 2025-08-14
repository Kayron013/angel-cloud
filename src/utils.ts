import * as fs from 'fs';
import * as path from 'path';
import { env } from './env';

export const readScript = (scriptPath: string) => {
  const fullPath = path.join(__dirname, scriptPath);
  const script = fs.readFileSync(fullPath, 'utf-8');
  return replaceEnvVars(script);
};

const envMap = Object.entries(env).reduce((acc, [key, value]) => {
  acc[`__${key}__`] = value;
  return acc;
}, {} as Record<string, string>);

const replaceEnvVars = (script: string) => {
  return Object.entries(envMap).reduce((acc, [key, value]) => {
    return acc.replace(key, value);
  }, script);
};
