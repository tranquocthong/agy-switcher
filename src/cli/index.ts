#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from '../commands/init.js';
import { switchCommand } from '../commands/switch.js';
import { runCommand } from '../commands/run.js';
import { statusCommand } from '../commands/status.js';
import { doctorCommand } from '../commands/doctor.js';
import { addProfileCommand } from '../commands/profile/add.js';
import { listProfilesCommand } from '../commands/profile/list.js';
import { removeProfileCommand } from '../commands/profile/remove.js';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

const program = new Command();

program
  .name('agyw')
  .description('Agency Profile Switcher for agy (Google Antigravity CLI)')
  .version(pkg.version);

program.command('init').description('Initialize agyw from existing ~/.gemini/antigravity-cli/').action(initCommand);

program.command('switch <name>').description('Switch to profile (supports prefix matching)').action(switchCommand);

program.command('status').description('Show active profile and symlink health').action(statusCommand);

program.command('doctor').description('Diagnose profile and symlink issues').action(doctorCommand);

const run = program.command('run <name>').description('Switch profile and spawn agy');
run.allowUnknownOption(true);
run.action((name: string, _opts: unknown, cmd: Command) => {
  const extra = cmd.args.slice(1);
  runCommand(name, extra);
});

program.command('add <name>').description('Add a new profile').option('--clone <source>', 'Clone from source profile').action(addProfileCommand);
program.command('list').description('List all profiles').action(listProfilesCommand);
program.command('remove <name>').description('Remove a profile').action(removeProfileCommand);

program.parse();
