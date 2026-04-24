import { Command } from 'commander';
import { ConfigStore } from '../../config/ConfigStore.js';

export function configCommand(): Command {
  const cmd = new Command('config').description('Manage gateway credentials and settings');

  cmd
    .command('set <key> <value>')
    .description('Set a config value (e.g. elevenlabs.api_key <KEY>)')
    .action((key: string, value: string) => {
      try {
        ConfigStore.set(key, value);
        console.log(`\x1b[32m✓\x1b[0m Set ${key}`);
        console.log(`  Config stored at: ${ConfigStore.configPath()}`);
      } catch (err) {
        console.error(`\x1b[31mError:\x1b[0m ${(err as Error).message}`);
        process.exit(1);
      }
    });

  cmd
    .command('get <key>')
    .description('Get a config value')
    .action((key: string) => {
      const val = ConfigStore.get(key);
      if (val === undefined) {
        console.log(`(not set)`);
      } else if (typeof val === 'string' && key.includes('key') || key.includes('secret')) {
        // Mask sensitive values
        console.log(`${key} = ${'*'.repeat(Math.min(8, (val as string).length))}...`);
      } else {
        console.log(`${key} = ${JSON.stringify(val)}`);
      }
    });

  cmd
    .command('list')
    .description('Show all config (secrets masked)')
    .action(() => {
      const all = ConfigStore.all();
      const masked = maskSecrets(all);
      console.log(JSON.stringify(masked, null, 2));
      console.log(`\n  Config path: ${ConfigStore.configPath()}`);
    });

  return cmd;
}

function maskSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['api_key', 'secret', 'password', 'token'];
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'object' && v !== null) {
      result[k] = maskSecrets(v as Record<string, unknown>);
    } else if (typeof v === 'string' && sensitiveKeys.some(s => k.includes(s))) {
      result[k] = `${'*'.repeat(Math.min(8, v.length))}...`;
    } else {
      result[k] = v;
    }
  }
  return result;
}
