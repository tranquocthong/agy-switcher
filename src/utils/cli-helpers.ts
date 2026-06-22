import { AgywError } from './errors.js';

export function handleError(err: unknown): never {
  if (err instanceof AgywError) {
    process.stderr.write(`agyw: ${err.message}\n`);
    process.exit(err.exitCode);
  }
  if (err instanceof Error) {
    process.stderr.write(`agyw: unexpected error: ${err.message}\n`);
  } else {
    process.stderr.write(`agyw: unknown error\n`);
  }
  process.exit(1);
}
