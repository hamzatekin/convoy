import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateHttpServer } from '../../scripts/convoy-dev.ts';

const roots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'convoy-dev-'));
  roots.push(root);
  return root;
}

async function writeSchema(root: string): Promise<string> {
  const convoyDir = path.join(root, 'convoy');
  await mkdir(convoyDir, { recursive: true });
  const schemaPath = path.join(convoyDir, 'schema.ts');
  await writeFile(schemaPath, 'export default {};\n', 'utf8');
  return schemaPath;
}

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

describe('generateHttpServer', () => {
  it('generates a default http server when no user server exists', async () => {
    const root = await createTempRoot();
    const schemaPath = await writeSchema(root);

    await generateHttpServer(root, schemaPath);

    const httpPath = path.join(root, 'convoy', '_generated', 'http.ts');
    const content = await readFile(httpPath, 'utf8');
    expect(content).toContain('const overrideContext = options.createContext');
    expect(content).toContain('const resolveContext = overrideContext');
    expect(content).toContain('createBaseContext(db)');
    expect(content).not.toContain('userServer');
  });

  it('uses a user server createContext when present', async () => {
    const root = await createTempRoot();
    const schemaPath = await writeSchema(root);
    const serverPath = path.join(root, 'convoy', 'server.ts');
    await writeFile(serverPath, 'export function createContext() { return null as any; }\n', 'utf8');

    await generateHttpServer(root, schemaPath);

    const httpPath = path.join(root, 'convoy', '_generated', 'http.ts');
    const content = await readFile(httpPath, 'utf8');
    expect(content).toContain('import * as userServer from "../server.ts";');
    expect(content).toContain('userServer.createContext');
    expect(content).toContain('Expected convoy/server.ts to export createContext(req)');
    expect(content).toContain('configureServer');
  });
});
