import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function load(extra = {}) {
  const context = vm.createContext({ console, Date, Math, JSON, Set, Map, ...extra });
  for (const name of fs
    .readdirSync(root)
    .filter((n) => n.endsWith('.gs'))
    .sort())
    vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context, { filename: name });
  return context;
}
