import fs from 'fs';
import path from 'path';
import os from 'os';
import { Config, ConfigSchema } from './schema.js';

const CONFIG_PATH = process.env.CHAMPIQ_CONFIG
  || path.join(os.homedir(), '.champiq', 'config.json');

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readRaw(): Record<string, unknown> {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Overlay well-known env vars on top of the file-based config */
function mergeEnvOverrides(raw: Record<string, unknown>): Record<string, unknown> {
  const out = structuredClone(raw) as Record<string, unknown>;

  const set = (path: string[], val: string | number) => {
    let cursor = out;
    for (let i = 0; i < path.length - 1; i++) {
      if (typeof cursor[path[i]] !== 'object' || cursor[path[i]] === null) cursor[path[i]] = {};
      cursor = cursor[path[i]] as Record<string, unknown>;
    }
    cursor[path[path.length - 1]] = val;
  };

  if (process.env['REDIS_URL']) set(['redis', 'url'], process.env['REDIS_URL']);
  if (process.env['PORT']) set(['gateway', 'port'], parseInt(process.env['PORT'], 10));
  if (process.env['GATEWAY_API_KEY']) set(['gateway', 'api_key'], process.env['GATEWAY_API_KEY']);
  if (process.env['CANVAS_WEBHOOK_URL']) set(['canvas', 'webhook_url'], process.env['CANVAS_WEBHOOK_URL']);
  if (process.env['CANVAS_WEBHOOK_SECRET']) set(['canvas', 'webhook_secret'], process.env['CANVAS_WEBHOOK_SECRET']);
  if (process.env['ELEVENLABS_API_KEY']) set(['providers', 'elevenlabs', 'api_key'], process.env['ELEVENLABS_API_KEY']);
  if (process.env['ELEVENLABS_AGENT_ID']) set(['providers', 'elevenlabs', 'agent_id'], process.env['ELEVENLABS_AGENT_ID']);
  if (process.env['ELEVENLABS_PHONE_NUMBER_ID']) set(['providers', 'elevenlabs', 'phone_number_id'], process.env['ELEVENLABS_PHONE_NUMBER_ID']);
  if (process.env['ELEVENLABS_WEBHOOK_SECRET']) set(['providers', 'elevenlabs', 'webhook_secret'], process.env['ELEVENLABS_WEBHOOK_SECRET']);
  if (process.env['PUBLIC_GATEWAY_URL']) set(['gateway', 'public_url'], process.env['PUBLIC_GATEWAY_URL']);

  return out;
}

function writeRaw(data: Record<string, unknown>): void {
  ensureDir(CONFIG_PATH);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export class ConfigStore {
  static load(): Config {
    const raw = mergeEnvOverrides(readRaw());
    const result = ConfigSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(`Invalid config at ${CONFIG_PATH}:\n${result.error.message}`);
    }
    return result.data;
  }

  static loadOrEmpty(): Config {
    try {
      return ConfigStore.load();
    } catch {
      return ConfigSchema.parse(mergeEnvOverrides({}));
    }
  }

  /** Set a nested key using dot notation e.g. "elevenlabs.api_key" */
  static set(keyPath: string, value: string): void {
    const raw = readRaw();
    const parts = keyPath.split('.');

    // Map top-level aliases to nested paths
    const resolved = ConfigStore.resolveKey(parts);
    let cursor: Record<string, unknown> = raw;
    for (let i = 0; i < resolved.length - 1; i++) {
      const k = resolved[i];
      if (typeof cursor[k] !== 'object' || cursor[k] === null) {
        cursor[k] = {};
      }
      cursor = cursor[k] as Record<string, unknown>;
    }
    const lastKey = resolved[resolved.length - 1];
    // Coerce numeric values
    cursor[lastKey] = /^\d+$/.test(value) ? parseInt(value, 10) : value;
    writeRaw(raw);
  }

  static get(keyPath: string): unknown {
    const raw = readRaw();
    const parts = ConfigStore.resolveKey(keyPath.split('.'));
    let cursor: unknown = raw;
    for (const k of parts) {
      if (typeof cursor !== 'object' || cursor === null) return undefined;
      cursor = (cursor as Record<string, unknown>)[k];
    }
    return cursor;
  }

  static all(): Record<string, unknown> {
    return readRaw();
  }

  static configPath(): string {
    return CONFIG_PATH;
  }

  /** Map shorthand "elevenlabs.api_key" → ["providers","elevenlabs","api_key"] */
  private static resolveKey(parts: string[]): string[] {
    const providerNames = ['elevenlabs', 'bland', 'vapi'];
    if (providerNames.includes(parts[0])) {
      return ['providers', ...parts];
    }
    return parts;
  }
}
