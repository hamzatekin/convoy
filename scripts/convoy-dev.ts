import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { spawn, type ChildProcess } from 'node:child_process';
import { watch, type FSWatcher } from 'node:fs';
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

type CliOptions = {
  rootDir: string;
  schemaPath?: string;
  command: 'dev';
  watch: boolean;
  serve: boolean;
};

const SCHEMA_TEMPLATE = `import { z } from "zod";
import { defineSchema, defineTable } from "convoy";

const schema = defineSchema({
  users: defineTable({
    deviceId: z.string(),
    createdAt: z.number(),
  }),
});

export default schema;
`;

const FUNCTIONS_DIRNAME = 'functions';
const GENERATED_DIRNAME = '_generated';

type FunctionExport = {
  kind: 'query' | 'mutation';
  exportName: string;
  fullName: string;
  pathSegments: string[];
  moduleVar: string;
};

type ApiTree = Record<string, ApiTree | FunctionExport>;

type ModuleInfo = {
  filePath: string;
  importPath: string;
  varName: string;
  pathSegments: string[];
};

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  let command: CliOptions['command'] = 'dev';
  let rootDir = process.cwd();
  let schemaPath: string | undefined;
  let watchMode = true;
  let serveMode: boolean | null = null;

  if (args[0] && !args[0].startsWith('-')) {
    const maybeCommand = args.shift();
    if (maybeCommand === 'dev') {
      command = 'dev';
    } else if (maybeCommand === 'init') {
      command = 'dev';
    } else if (maybeCommand) {
      throw new Error(`Unknown command: ${maybeCommand}`);
    }
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--root') {
      const next = args[i + 1];
      if (!next) {
        throw new Error('--root expects a path');
      }
      rootDir = next;
      i += 1;
      continue;
    }
    if (arg.startsWith('--root=')) {
      rootDir = arg.slice('--root='.length);
      continue;
    }
    if (arg === '--schema') {
      const next = args[i + 1];
      if (!next) {
        throw new Error('--schema expects a path');
      }
      schemaPath = next;
      i += 1;
      continue;
    }
    if (arg.startsWith('--schema=')) {
      schemaPath = arg.slice('--schema='.length);
      continue;
    }
    if (arg === '--watch') {
      watchMode = true;
      continue;
    }
    if (arg === '--no-watch' || arg === '--once') {
      watchMode = false;
      continue;
    }
    if (arg === '--serve') {
      serveMode = true;
      continue;
    }
    if (arg === '--no-serve') {
      serveMode = false;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return {
    command,
    rootDir,
    schemaPath,
    watch: watchMode,
    serve: serveMode ?? watchMode,
  };
}

function toImportPath(fromDir: string, filePath: string, options: { stripExtension?: boolean } = {}): string {
  const relative = path.relative(fromDir, filePath);
  let normalized = relative.split(path.sep).join('/');
  const stripExtension = options.stripExtension ?? true;
  if (stripExtension) {
    if (normalized.endsWith('.d.ts')) {
      normalized = normalized.slice(0, -5);
    } else if (normalized.endsWith('.ts') || normalized.endsWith('.tsx')) {
      normalized = normalized.replace(/\.[^.]+$/, '');
    }
  }
  return normalized.startsWith('.') ? normalized : `./${normalized}`;
}

async function resolveRuntimeImport(rootDir: string, generatedDir: string): Promise<string> {
  const override = process.env.CONVOY_RUNTIME_IMPORT;
  if (override) {
    return override;
  }

  const parentDir = path.resolve(rootDir, '..');
  const localSrc = path.join(parentDir, 'src', 'index.ts');
  const localPackage = path.join(parentDir, 'package.json');

  if (await pathExists(localSrc)) {
    try {
      const raw = await readFile(localPackage, 'utf8');
      const pkg = JSON.parse(raw) as { name?: string };
      if (pkg.name === 'convoy') {
        return toImportPath(generatedDir, localSrc);
      }
    } catch {
      // fall back to package import
    }
  }

  return 'convoy';
}

async function resolveNodeRuntimeImport(rootDir: string, generatedDir: string): Promise<string> {
  const override = process.env.CONVOY_NODE_RUNTIME_IMPORT;
  if (override) {
    return override;
  }

  const parentDir = path.resolve(rootDir, '..');
  const localSrc = path.join(parentDir, 'src', 'node.ts');
  const localPackage = path.join(parentDir, 'package.json');

  if (await pathExists(localSrc)) {
    try {
      const raw = await readFile(localPackage, 'utf8');
      const pkg = JSON.parse(raw) as { name?: string };
      if (pkg.name === 'convoy') {
        return toImportPath(generatedDir, localSrc);
      }
    } catch {
      // fall back to package import
    }
  }

  return 'convoy/node';
}

async function listFunctionFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === GENERATED_DIRNAME || entry.name === 'node_modules') {
          continue;
        }
        const nested = await listFunctionFiles(fullPath);
        files.push(...nested);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) {
        continue;
      }
      files.push(fullPath);
    }
    return files.sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function isConvoyFunction(value: unknown): value is { kind: 'query' | 'mutation' } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  return kind === 'query' || kind === 'mutation';
}

function isFunctionExport(value: unknown): value is FunctionExport {
  return Boolean(value && typeof value === 'object' && 'kind' in value && 'fullName' in value);
}

function buildApiTree(exportsList: FunctionExport[]): ApiTree {
  const tree: ApiTree = {};
  for (const entry of exportsList) {
    let current = tree;
    const segments = entry.pathSegments;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i];
      const next = current[segment];
      if (isFunctionExport(next)) {
        throw new Error(`API path conflict at "${segment}"`);
      }
      if (!next) {
        current[segment] = {};
      }
      current = current[segment] as ApiTree;
    }
    const leaf = segments[segments.length - 1];
    if (current[leaf]) {
      throw new Error(`Duplicate API path "${entry.fullName}"`);
    }
    current[leaf] = entry;
  }
  return tree;
}

type ApiLeafRenderer = (key: string, entry: FunctionExport, indent: string) => string;

function renderApiTree(tree: ApiTree, indent: string, renderLeaf: ApiLeafRenderer): string {
  const entries = Object.entries(tree).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return '{}';
  }
  const nextIndent = `${indent}  `;
  const lines = entries.map(([key, value]) => {
    if (isFunctionExport(value)) {
      return renderLeaf(key, value, nextIndent);
    }
    return `${nextIndent}${key}: ${renderApiTree(value as ApiTree, nextIndent, renderLeaf)}`;
  });
  return `{\n${lines.join(',\n')}\n${indent}}`;
}

function renderApiFile(modules: ModuleInfo[], tree: ApiTree, exportsList: FunctionExport[]): string {
  if (exportsList.length === 0) {
    return `// Generated by convoy dev. Do not edit.\nexport const api = {} as const;\nexport type Api = typeof api;\n`;
  }
  const importLines = [
    `import { makeMutationRef, makeQueryRef } from "convoy/client";`,
    ...modules.map((mod) => `import type * as ${mod.varName} from "${mod.importPath}";`),
  ];
  const apiBody = renderApiTree(tree, '', (key, entry, indent) => {
    const builder = entry.kind === 'query' ? 'makeQueryRef' : 'makeMutationRef';
    const ref = `${builder}("${entry.fullName}", null as unknown as typeof ${entry.moduleVar}.${entry.exportName})`;
    return `${indent}${key}: ${ref}`;
  });
  return `// Generated by convoy dev. Do not edit.\n${importLines.join('\n')}\n\nexport const api = ${apiBody} as const;\n\nexport type Api = typeof api;\n`;
}

function renderApiTypesFile(modules: ModuleInfo[], tree: ApiTree, exportsList: FunctionExport[]): string {
  if (exportsList.length === 0) {
    return `// Generated by convoy dev. Do not edit.\nexport declare const api: {};\nexport type Api = typeof api;\n`;
  }
  const importLines = [
    `import type { MutationRef, QueryRef } from "convoy/client";`,
    ...modules.map((mod) => `import type * as ${mod.varName} from "${mod.importPath}";`),
  ];
  const apiBody = renderApiTree(tree, '', (key, entry, indent) => {
    const refType = entry.kind === 'query' ? 'QueryRefFor' : 'MutationRefFor';
    const ref = `${refType}<"${entry.fullName}", typeof ${entry.moduleVar}.${entry.exportName}>`;
    return `${indent}${key}: ${ref}`;
  });
  const helperTypes = [
    `type ArgsOfFunction<TFunc> =`,
    `  TFunc extends { handler: (ctx: any, args: infer TArgs) => any }`,
    `    ? TArgs`,
    `    : never;`,
    `type ResultOfFunction<TFunc> =`,
    `  TFunc extends { handler: (ctx: any, args: any) => infer TResult }`,
    `    ? Awaited<TResult>`,
    `    : never;`,
    `type QueryRefFor<`,
    `  Name extends string,`,
    `  TFunc,`,
    `> = QueryRef<Name, ArgsOfFunction<TFunc>, ResultOfFunction<TFunc>>;`,
    `type MutationRefFor<`,
    `  Name extends string,`,
    `  TFunc,`,
    `> = MutationRef<Name, ArgsOfFunction<TFunc>, ResultOfFunction<TFunc>>;`,
  ];
  return `// Generated by convoy dev. Do not edit.\n${importLines.join('\n')}\n\n${helperTypes.join('\n')}\n\nexport declare const api: ${apiBody};\n\nexport type Api = typeof api;\n`;
}

function renderFunctionMap(exportsList: FunctionExport[], kind: 'query' | 'mutation'): string {
  const entries = exportsList
    .filter((entry) => entry.kind === kind)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  if (entries.length === 0) {
    return '{}';
  }
  const lines = entries.map((entry) => `  "${entry.fullName}": ${entry.moduleVar}.${entry.exportName}`);
  return `{\n${lines.join(',\n')}\n}`;
}

function renderFunctionsFile(modules: ModuleInfo[], exportsList: FunctionExport[]): string {
  if (exportsList.length === 0) {
    return `// Generated by convoy dev. Do not edit.\nexport const queries = {} as const;\nexport const mutations = {} as const;\nexport type QueryName = keyof typeof queries;\nexport type MutationName = keyof typeof mutations;\n`;
  }
  const importLines = modules.map((mod) => `import * as ${mod.varName} from "${mod.importPath}";`);
  const queries = renderFunctionMap(exportsList, 'query');
  const mutations = renderFunctionMap(exportsList, 'mutation');
  return `// Generated by convoy dev. Do not edit.\n${importLines.join('\n')}\n\nexport const queries = ${queries} as const;\n\nexport const mutations = ${mutations} as const;\n\nexport type QueryName = keyof typeof queries;\nexport type MutationName = keyof typeof mutations;\n`;
}

async function generateApi(rootDir: string, options: { cacheBust?: boolean } = {}): Promise<void> {
  const convoyDir = path.join(rootDir, 'convoy');
  const functionsDir = path.join(convoyDir, FUNCTIONS_DIRNAME);
  const generatedDir = path.join(convoyDir, GENERATED_DIRNAME);
  await mkdir(functionsDir, { recursive: true });
  await mkdir(generatedDir, { recursive: true });
  const cacheBust = options.cacheBust ?? false;

  const functionFiles = await listFunctionFiles(functionsDir);
  const modules: ModuleInfo[] = [];
  const exportsList: FunctionExport[] = [];
  let moduleIndex = 0;

  for (const filePath of functionFiles) {
    const relative = path.relative(functionsDir, filePath);
    const parsed = path.parse(relative);
    const segments = parsed.dir ? parsed.dir.split(path.sep).filter(Boolean) : [];
    if (parsed.name !== 'index') {
      segments.push(parsed.name);
    }
    const moduleVar = `mod${moduleIndex}`;
    moduleIndex += 1;
    const importPath = toImportPath(generatedDir, filePath);
    modules.push({
      filePath,
      importPath,
      varName: moduleVar,
      pathSegments: segments,
    });

    const moduleUrl = pathToFileURL(filePath).href;
    const importUrl = cacheBust ? `${moduleUrl}?t=${Date.now()}` : moduleUrl;
    const moduleExports = await import(importUrl);
    for (const [exportName, exported] of Object.entries(moduleExports)) {
      if (!isConvoyFunction(exported)) {
        continue;
      }
      const pathSegments = [...segments, exportName];
      const fullName = pathSegments.join('.');
      exportsList.push({
        kind: exported.kind,
        exportName,
        fullName,
        pathSegments,
        moduleVar,
      });
    }
  }

  const seenNames = new Set<string>();
  for (const entry of exportsList) {
    if (seenNames.has(entry.fullName)) {
      throw new Error(`Duplicate function name "${entry.fullName}"`);
    }
    seenNames.add(entry.fullName);
  }

  const apiTree = buildApiTree(exportsList);
  const apiContent = renderApiFile(modules, apiTree, exportsList);
  const apiTypesContent = renderApiTypesFile(modules, apiTree, exportsList);
  const functionsContent = renderFunctionsFile(modules, exportsList);

  await writeFileIfChanged(path.join(generatedDir, 'api.ts'), apiContent);
  await writeFileIfChanged(path.join(generatedDir, 'api.d.ts'), apiTypesContent);
  await writeFileIfChanged(path.join(generatedDir, 'functions.ts'), functionsContent);
}

async function generateServer(rootDir: string, schemaPath: string): Promise<void> {
  const convoyDir = path.join(rootDir, 'convoy');
  const generatedDir = path.join(convoyDir, GENERATED_DIRNAME);
  await mkdir(generatedDir, { recursive: true });

  const schemaImport = toImportPath(generatedDir, schemaPath);
  const runtimeImport = await resolveRuntimeImport(rootDir, generatedDir);

  const content = `// Generated by convoy dev. Do not edit.
import schema from "${schemaImport}";
import { createFunctionHelpers, type ConvoyContext, type DbFromSchema } from "${runtimeImport}";

type Db = DbFromSchema<typeof schema>;
export type ServerContext = ConvoyContext<Db>;

const helpers = createFunctionHelpers<ServerContext>();
export const query = helpers.query;
export const mutation = helpers.mutation;
`;

  await writeFileIfChanged(path.join(generatedDir, 'server.ts'), content);
}

async function generateServerTypes(rootDir: string, schemaPath: string): Promise<void> {
  const convoyDir = path.join(rootDir, 'convoy');
  const generatedDir = path.join(convoyDir, GENERATED_DIRNAME);
  await mkdir(generatedDir, { recursive: true });

  const schemaImport = toImportPath(generatedDir, schemaPath);
  const runtimeImport = await resolveRuntimeImport(rootDir, generatedDir);

  const content = `// Generated by convoy dev. Do not edit.
import type schema from "${schemaImport}";
import type {
  ConvoyContext,
  ConvoyFunction,
  ConvoyFunctionDefinition,
  DbFromSchema,
} from "${runtimeImport}";
import type { ZodRawShape } from "zod";

type Db = DbFromSchema<typeof schema>;
export type ServerContext = ConvoyContext<Db>;

type ArgsShape = ZodRawShape;

export declare const query: <TArgs extends ArgsShape, TResult>(
  definition: ConvoyFunctionDefinition<ServerContext, TArgs, TResult>,
) => ConvoyFunction<ServerContext, TArgs, TResult>;

export declare const mutation: <TArgs extends ArgsShape, TResult>(
  definition: ConvoyFunctionDefinition<ServerContext, TArgs, TResult>,
) => ConvoyFunction<ServerContext, TArgs, TResult>;
`;

  await writeFileIfChanged(path.join(generatedDir, 'server.d.ts'), content);
}

async function generateHttpServer(rootDir: string, schemaPath: string): Promise<void> {
  const convoyDir = path.join(rootDir, 'convoy');
  const generatedDir = path.join(convoyDir, GENERATED_DIRNAME);
  await mkdir(generatedDir, { recursive: true });

  const schemaImport = toImportPath(generatedDir, schemaPath);
  const runtimeImport = await resolveRuntimeImport(rootDir, generatedDir);
  const nodeRuntimeImport = await resolveNodeRuntimeImport(rootDir, generatedDir);

  const content = `// Generated by convoy dev. Do not edit.
import type { IncomingMessage, ServerResponse } from "node:http";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import schema from "${schemaImport}";
import { createContext, createDb } from "${runtimeImport}";
import { createNodeServer } from "${nodeRuntimeImport}";
import { mutations, queries } from "./functions";

const DEFAULT_INVALIDATION_CHANNEL = "convoy_invalidation";
const DEBUG = process.env.CONVOY_DEBUG === "1";

type InvalidationListener = {
  close: () => Promise<void>;
};

type QueryResultMessage = {
  type: "result";
  name: string;
  ts: number;
  data: unknown;
};

type QueryErrorMessage = {
  type: "error";
  name: string;
  ts: number;
  error: string;
};

type QuerySubscription = {
  res: ServerResponse;
  name: string;
  args: unknown;
  fn: (typeof queries)[keyof typeof queries];
  running: boolean;
  pending: boolean;
};

export type ConvoyHttpOptions = {
  port?: number;
  host?: string;
  basePath?: string;
  maxBodySize?: number;
  subscribePath?: string;
  invalidationChannel?: string;
};

function isValidChannelName(channel: string): boolean {
  return /^[a-zA-Z0-9_]+$/.test(channel);
}

function resolveChannelName(channel?: string): string {
  const resolved = channel ?? DEFAULT_INVALIDATION_CHANNEL;
  if (!isValidChannelName(resolved)) {
    throw new Error("Invalid invalidation channel name");
  }
  return resolved;
}

function debugLog(message: string, details?: unknown): void {
  if (!DEBUG) {
    return;
  }
  if (details === undefined) {
    console.log("[convoy] " + message);
    return;
  }
  console.log("[convoy] " + message, details);
}

function writeSse(
  res: ServerResponse,
  payload: QueryResultMessage | QueryErrorMessage,
): void {
  res.write("data: " + JSON.stringify(payload) + "\\n\\n");
}

function createQuerySubscriptionManager<TDb>(db: TDb) {
  const subscriptions = new Set<QuerySubscription>();
  const context = createContext(db as TDb);

  const runSubscription = async (subscription: QuerySubscription) => {
    if (subscription.res.writableEnded || subscription.res.destroyed) {
      subscriptions.delete(subscription);
      return;
    }
    subscription.running = true;
    try {
      const data = await subscription.fn.run(
        context as any,
        subscription.args
      );
      writeSse(subscription.res, {
        type: "result",
        name: subscription.name,
        ts: Date.now(),
        data,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Query failed";
      writeSse(subscription.res, {
        type: "error",
        name: subscription.name,
        ts: Date.now(),
        error: message,
      });
    } finally {
      subscription.running = false;
      if (subscription.pending) {
        subscription.pending = false;
        void runSubscription(subscription);
      }
    }
  };

  const queueRefresh = (subscription: QuerySubscription) => {
    if (subscription.running) {
      subscription.pending = true;
      return;
    }
    void runSubscription(subscription);
  };

  const refreshAll = () => {
    for (const subscription of subscriptions) {
      queueRefresh(subscription);
    }
  };

  const subscribe = (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end("Missing URL");
      return;
    }

    const url = new URL(req.url, \`http://\${req.headers.host ?? "localhost"}\`);
    const name = url.searchParams.get("name");
    if (!name) {
      res.statusCode = 400;
      res.end("Missing query name");
      return;
    }

    let args: unknown = {};
    const rawArgs = url.searchParams.get("args");
    if (rawArgs) {
      try {
        args = JSON.parse(rawArgs);
      } catch {
        res.statusCode = 400;
        res.end("Invalid args");
        return;
      }
    }

    const fn = queries[name as keyof typeof queries];
    if (!fn) {
      res.statusCode = 404;
      res.end("Unknown query");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("\\n");

    const subscription: QuerySubscription = {
      res,
      name,
      args,
      fn,
      running: false,
      pending: false,
    };
    subscriptions.add(subscription);
    debugLog("Query subscribed", { name, count: subscriptions.size });

    const cleanup = () => {
      subscriptions.delete(subscription);
      debugLog("Query unsubscribed", { name, count: subscriptions.size });
    };
    res.on("close", cleanup);
    res.on("error", cleanup);

    void runSubscription(subscription);
  };

  return { subscribe, refreshAll };
}

function startInvalidationListener(
  databaseUrl: string,
  channel: string,
  onInvalidation: () => void,
): InvalidationListener {
  const client = new Client({ connectionString: databaseUrl });
  client.on("notification", (msg) => {
    if (msg.channel !== channel) {
      return;
    }
    debugLog("NOTIFY received", { channel, payload: msg.payload ?? "" });
    onInvalidation();
  });
  client.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Convoy invalidation listener error: " + message);
  });

  const ready = client
    .connect()
    .then(() => client.query("LISTEN " + channel))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Convoy invalidation listener failed: " + message);
    });

  return {
    close: async () => {
      await ready;
      await client.end().catch(() => undefined);
    },
  };
}

export function createConvoyServer(options: ConvoyHttpOptions = {}) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing. Set it in your environment or .env.");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = createDb(drizzle(pool), schema);
  const invalidationChannel = resolveChannelName(options.invalidationChannel);
  const subscriptions = createQuerySubscriptionManager(db);
  const invalidationListener = startInvalidationListener(
    databaseUrl,
    invalidationChannel,
    () => subscriptions.refreshAll(),
  );

  const server = createNodeServer({
    queries,
    mutations,
    basePath: options.basePath,
    maxBodySize: options.maxBodySize,
    subscribePath: options.subscribePath,
    onSubscribe: subscriptions.subscribe,
    createContext: () => createContext(db),
    onMutation: async ({ name }) => {
      const payload = JSON.stringify({
        type: "mutation",
        name,
        ts: Date.now(),
      });
      debugLog("NOTIFY send", { channel: invalidationChannel, payload });
      await pool.query("SELECT pg_notify($1, $2)", [
        invalidationChannel,
        payload,
      ]);
    },
  });

  return { server, pool, invalidationListener };
}

export async function startConvoyServer(options: ConvoyHttpOptions = {}) {
  const { server, pool, invalidationListener } = createConvoyServer(options);
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const host = options.host ?? process.env.HOST;

  await new Promise<void>((resolve) => {
    server.listen(port, host, () => resolve());
  });

  const shutdown = () => {
    server.close(() => {
      invalidationListener.close().catch(() => undefined);
      pool.end().catch(() => undefined);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const argvPath = process.argv[1];
const isMain = Boolean(argvPath) &&
  import.meta.url === pathToFileURL(argvPath).href;
if (isMain) {
  startConvoyServer().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
`;

  await writeFileIfChanged(path.join(generatedDir, 'http.ts'), content);
}

async function generateDataModelTypes(rootDir: string, schemaPath: string): Promise<void> {
  const convoyDir = path.join(rootDir, 'convoy');
  const generatedDir = path.join(convoyDir, GENERATED_DIRNAME);
  await mkdir(generatedDir, { recursive: true });

  const schemaImport = toImportPath(generatedDir, schemaPath);
  const runtimeImport = await resolveRuntimeImport(rootDir, generatedDir);

  const content = `// Generated by convoy dev. Do not edit.
import type schema from "${schemaImport}";
import type { Id, InferTableRow } from "${runtimeImport}";

export type DataModel = typeof schema;
export type TableName = keyof DataModel & string;
export type Doc<TName extends TableName> =
  InferTableRow<DataModel[TName]> & { id: Id<TName> };
`;

  await writeFileIfChanged(path.join(generatedDir, 'dataModel.d.ts'), content);
}

function quoteIdent(name: string): string {
  if (name.length === 0) {
    throw new Error('Database and table names cannot be empty');
  }
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeFileIfChanged(filePath: string, nextContent: string): Promise<boolean> {
  try {
    const current = await readFile(filePath, 'utf8');
    if (current === nextContent) {
      return false;
    }
  } catch {
    // file does not exist or cannot be read
  }
  await writeFile(filePath, nextContent, 'utf8');
  return true;
}

async function loadSchemaModule(schemaPath: string, cacheBust = false): Promise<Record<string, any>> {
  try {
    const moduleUrl = pathToFileURL(schemaPath).href;
    const importUrl = cacheBust ? `${moduleUrl}?t=${Date.now()}` : moduleUrl;
    const schemaModule = await import(importUrl);
    const schema = schemaModule.default ?? schemaModule.schema;
    if (!schema || typeof schema !== 'object') {
      throw new Error('schema.ts must export a schema object (default or named)');
    }
    return schema as Record<string, any>;
  } catch (error) {
    const isBun = Boolean(process.versions?.bun);
    const isTypeScript = schemaPath.endsWith('.ts');
    if (!isBun && isTypeScript) {
      throw new Error('schema.ts is TypeScript. Run this with bun or with Node using a TS loader (tsx/ts-node).');
    }
    throw error;
  }
}

function loadEnvFiles(rootDir: string): void {
  const rootEnv = path.join(rootDir, '.env');
  loadEnv({ path: rootEnv });

  const cwdEnv = path.join(process.cwd(), '.env');
  if (cwdEnv !== rootEnv) {
    loadEnv({ path: cwdEnv });
  }
}

async function ensureDatabase(databaseUrl: string): Promise<void> {
  const targetUrl = new URL(databaseUrl);
  const dbName = decodeURIComponent(targetUrl.pathname.replace(/^\//, ''));
  if (!dbName) {
    throw new Error('DATABASE_URL must include a database name');
  }

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';

  const adminClient = new Client({ connectionString: adminUrl.toString() });
  await adminClient.connect();
  const exists = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) {
    await adminClient.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
  }
  await adminClient.end();
}

async function ensureTables(databaseUrl: string, schema: Record<string, any>): Promise<string[]> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  const createdTables: string[] = [];
  for (const [key, table] of Object.entries(schema)) {
    if (!table || typeof table !== 'object') {
      throw new Error(`Invalid table definition for "${key}"`);
    }
    const tableName = String(table.name ?? key);
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        data jsonb NOT NULL DEFAULT '{}'::jsonb
      )`,
    );
    const indexes = table.indexes ?? {};
    for (const [indexName, fields] of Object.entries(indexes)) {
      if (!Array.isArray(fields) || fields.length === 0) {
        continue;
      }
      const columnList = fields.map((field) => `(data->>${quoteLiteral(String(field))})`).join(', ');
      await client.query(
        `CREATE INDEX IF NOT EXISTS ${quoteIdent(`${tableName}_${indexName}`)} ON ${quoteIdent(tableName)} (${columnList})`,
      );
    }
    createdTables.push(tableName);
  }

  await client.end();
  return createdTables;
}

function resolveSchemaPath(options: CliOptions, rootDir: string): { convoyDir: string; schemaPath: string } {
  const convoyDir = path.join(rootDir, 'convoy');
  const schemaPath = options.schemaPath ? path.resolve(rootDir, options.schemaPath) : path.join(convoyDir, 'schema.ts');
  return { convoyDir, schemaPath };
}

async function syncOnce(options: CliOptions, cacheBust = false): Promise<void> {
  const rootDir = path.resolve(options.rootDir);
  const { convoyDir, schemaPath } = resolveSchemaPath(options, rootDir);
  await mkdir(convoyDir, { recursive: true });

  const schemaExists = await pathExists(schemaPath);
  if (!schemaExists) {
    await writeFile(schemaPath, SCHEMA_TEMPLATE, 'utf8');
    console.log(`Created ${schemaPath}`);
  }

  loadEnvFiles(rootDir);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing. Add it to your environment or .env file.');
  }

  const schema = await loadSchemaModule(schemaPath, cacheBust);
  await ensureDatabase(databaseUrl);
  const tables = await ensureTables(databaseUrl, schema);
  console.log(`Synced ${tables.length} table(s): ${tables.join(', ')}`);
  await generateServer(rootDir, schemaPath);
  await generateServerTypes(rootDir, schemaPath);
  await generateApi(rootDir, { cacheBust });
  await generateHttpServer(rootDir, schemaPath);
  await generateDataModelTypes(rootDir, schemaPath);
  console.log('Generated Convoy bindings');
}

async function startDevServer(rootDir: string): Promise<ChildProcess | null> {
  const entryPath = path.join(rootDir, 'convoy', GENERATED_DIRNAME, 'http.ts');
  const exists = await pathExists(entryPath);
  if (!exists) {
    console.error(`Missing ${entryPath}. Run convoy dev once to generate it.`);
    return null;
  }

  const env = { ...process.env };
  const override = process.env.CONVOY_DEV_SERVER_CMD;
  if (override) {
    return spawn(override, {
      stdio: 'inherit',
      shell: true,
      cwd: rootDir,
      env,
    });
  }

  return spawn(process.execPath, [entryPath], {
    stdio: 'inherit',
    cwd: rootDir,
    env,
  });
}

async function stopDevServer(server: ChildProcess | null): Promise<void> {
  if (!server || server.killed) {
    return;
  }
  await new Promise<void>((resolve) => {
    let resolved = false;
    const finalize = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };
    server.once('exit', finalize);
    server.kill();
    setTimeout(() => {
      if (!resolved) {
        server.kill('SIGKILL');
        finalize();
      }
    }, 2000);
  });
}

function isIgnoredPath(filePath: string): boolean {
  const parts = filePath.split(path.sep);
  return parts.includes(GENERATED_DIRNAME) || parts.includes('node_modules');
}

async function watchConvoyDir(convoyDir: string, onChange: (filePath: string | null) => void): Promise<() => void> {
  const watchers = new Map<string, FSWatcher>();

  const watchDir = async (dir: string): Promise<void> => {
    if (watchers.has(dir)) {
      return;
    }
    const watcher = watch(dir, { persistent: true }, async (_event, filename) => {
      const name = filename ? filename.toString() : null;
      const fullPath = name ? path.join(dir, name) : null;
      if (fullPath && isIgnoredPath(fullPath)) {
        return;
      }
      onChange(fullPath);
      if (!fullPath) {
        return;
      }
      try {
        const stats = await stat(fullPath);
        if (stats.isDirectory() && !isIgnoredPath(fullPath)) {
          await watchDir(fullPath);
        }
      } catch {
        // ignore missing paths
      }
    });
    watchers.set(dir, watcher);

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name.startsWith('.')) {
        continue;
      }
      if (entry.name === GENERATED_DIRNAME || entry.name === 'node_modules') {
        continue;
      }
      await watchDir(path.join(dir, entry.name));
    }
  };

  await watchDir(convoyDir);

  return () => {
    for (const watcher of watchers.values()) {
      watcher.close();
    }
    watchers.clear();
  };
}

async function watchCommand(options: CliOptions): Promise<void> {
  const rootDir = path.resolve(options.rootDir);
  const { convoyDir } = resolveSchemaPath(options, rootDir);
  await syncOnce(options, true);

  let pendingTimer: NodeJS.Timeout | null = null;
  let running = false;
  let rerun = false;
  let serverProcess: ChildProcess | null = null;
  let restartingServer = false;
  let restartQueued = false;

  const restartServer = async () => {
    if (!options.serve) {
      return;
    }
    if (restartingServer) {
      restartQueued = true;
      return;
    }
    restartingServer = true;
    try {
      await stopDevServer(serverProcess);
      serverProcess = await startDevServer(rootDir);
    } finally {
      restartingServer = false;
      if (restartQueued) {
        restartQueued = false;
        await restartServer();
      }
    }
  };
  await restartServer();

  const runSync = async () => {
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    let succeeded = false;
    try {
      do {
        rerun = false;
        await syncOnce(options, true);
      } while (rerun);
      succeeded = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
    } finally {
      running = false;
    }
    if (succeeded) {
      await restartServer();
    }
  };

  const schedule = () => {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
    }
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      runSync();
    }, 100);
  };

  const closeWatchers = await watchConvoyDir(convoyDir, () => schedule());
  const shutdown = () => {
    closeWatchers();
    stopDevServer(serverProcess).catch(() => undefined);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  console.log(`Watching ${convoyDir} for changes...`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'dev') {
    if (options.watch) {
      await watchCommand(options);
      return;
    }
    await syncOnce(options);
    if (options.serve) {
      const rootDir = path.resolve(options.rootDir);
      const server = await startDevServer(rootDir);
      if (server) {
        await new Promise<void>((resolve) => {
          server.once('exit', () => resolve());
        });
      }
    }
    return;
  }

  throw new Error(`Unknown command: ${options.command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
