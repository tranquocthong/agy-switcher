#!/usr/bin/env node
import { Command } from 'commander';
import { execCommand, listCommand, removeCommand, doctorCommand, removedCommand } from '../commands/exec.js';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

const program = new Command();

program
  .name('agyw')
  .description('Run multiple Google accounts in agy (Google Antigravity CLI) side by side, one isolated HOME per profile')
  .version(pkg.version);

for (const name of ['exec', 'run'] as const) {
  const cmd = program
    .command(`${name} <name>`)
    .description(
      name === 'exec'
        ? 'Run agy in the isolated HOME of profile <name> (created on first use)'
        : 'Alias of exec',
    );
  cmd.allowUnknownOption(true);
  cmd.action((profile: string, _opts: unknown, c: Command) => {
    execCommand(profile, c.args.slice(1));
  });
}

program.command('list').alias('ls').description('List profiles and whether each is logged in').action(listCommand);

program
  .command('remove <name>')
  .alias('rm')
  .description('Delete a profile (login and history included)')
  .option('--yes', 'Confirm deletion')
  .action(removeCommand);

program
  .command('doctor')
  .description('Check every profile is properly isolated')
  .option('--fix', 'Re-create shared links and passthrough, drop a Library symlink')
  .action(doctorCommand);

// Swap-mode commands, removed in 0.3.0: keep a clear message instead of "unknown command".
for (const name of ['switch', 'add', 'init', 'status']) {
  program
    .command(`${name} [args...]`, { hidden: true })
    .allowUnknownOption(true)
    .action(removedCommand(name));
}

program.parse();
