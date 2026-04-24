import { Config } from '../config/schema.js';
import { IVoiceProvider } from './types.js';
import { ElevenLabsProvider } from './elevenlabs/client.js';

// Minimal stub config — used when no env-level ElevenLabs config is set.
// Per-call credentials (elevenlabsApiKey etc.) override these empty strings at call time.
const EMPTY_EL_CONFIG = { api_key: '', agent_id: '', phone_number_id: '' };

export class ProviderRegistry {
  private providers: Map<string, IVoiceProvider> = new Map();

  constructor(config: Config) {
    // Always register elevenlabs — per-call credentials override empty config fields
    this.providers.set(
      'elevenlabs',
      new ElevenLabsProvider(config.providers.elevenlabs ?? EMPTY_EL_CONFIG),
    );
  }

  get(name: string): IVoiceProvider {
    const p = this.providers.get(name);
    if (!p) {
      throw new Error(
        `Provider "${name}" is not configured. Run: champiq-voice config set ${name}.api_key <KEY>`
      );
    }
    return p;
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }
}
