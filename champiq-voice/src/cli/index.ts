#!/usr/bin/env node
import { program } from 'commander';
import { callCommand } from './commands/call.js';
import { configCommand } from './commands/config.js';
import { statusCommand } from './commands/status.js';
import { logsCommand } from './commands/logs.js';
import { serveCommand } from './commands/serve.js';

program
  .name('champiq-voice')
  .description('ChampIQ Voice Gateway — AI calling agent CLI and HTTP gateway')
  .version('1.0.0');

program.addCommand(callCommand());
program.addCommand(configCommand());
program.addCommand(statusCommand());
program.addCommand(logsCommand());
program.addCommand(serveCommand());

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error('\x1b[31mError:\x1b[0m', (err as Error).message);
  process.exit(1);
});
