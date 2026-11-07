// Runs the API and the web app together with prefixed, colour-coded output.
// Usage: npm run dev
import { spawn } from 'node:child_process';

const procs = [
  { name: 'api', color: '\x1b[35m', cmd: 'npm', args: ['--prefix', 'server', 'run', 'dev'] },
  { name: 'web', color: '\x1b[36m', cmd: 'npx', args: ['vite'] },
];

const children = procs.map(({ name, color, cmd, args }) => {
  const child = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const prefix = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
