import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

type CliOptions = {
  rootDir: string;
  schemaPath?: string;
  command: "dev";
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

const FUNCTIONS_DIRNAME = "functions";
const GENERATED_DIRNAME = "_generated";

type FunctionExport = {
  kind: "query" | "mutation";
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
  let command: CliOptions["command"] = "dev";
  let rootDir = process.cwd();
  let schemaPath: string | undefined;

  if (args[0] && !args[0].startsWith("-")) {
    const maybeCommand = args.shift();
    if (maybeCommand === "dev") {
      command = "dev";
    } else if (maybeCommand === "init") {
      command = "dev";
    } else if (maybeCommand) {
      throw new Error(`Unknown command: ${maybeCommand}`);
    }
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--root") {
      const next = args[i + 1];
      if (!next) {
        throw new Error("--root expects a path");
      }
      rootDir = next;
      i += 1;
      continue;
    }
    if (arg.startsWith("--root=")) {
      rootDir = arg.slice("--root=".length);
      continue;
    }
    if (arg === "--schema") {
      const next = args[i + 1];
      if (!next) {
        throw new Error("--schema expects a path");
      }
      schemaPath = next;
      i += 1;
      continue;
    }
    if (arg.startsWith("--schema=")) {
      schemaPath = arg.slice("--schema=".length);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return { command, rootDir, schemaPath };
}

function toImportPath(fromDir: string, filePath: string): string {
  const relative = path.relative(fromDir, filePath);
  const normalized = relative.split(path.sep).join("/");
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

async function resolveRuntimeImport(
  rootDir: string,
  generatedDir: string,
): Promise<string> {
  const override = process.env.CONVOY_RUNTIME_IMPORT;
  if (override) {
    return override;
  }

  const parentDir = path.resolve(rootDir, "..");
  const localSrc = path.join(parentDir, "src", "index.ts");
  const localPackage = path.join(parentDir, "package.json");

  if (await pathExists(localSrc)) {
    try {
      const raw = await readFile(localPackage, "utf8");
      const pkg = JSON.parse(raw) as { name?: string };
      if (pkg.name === "convoy") {
        return toImportPath(generatedDir, localSrc);
      }
    } catch {
      // fall back to package import
    }
  }

  return "convoy";
}

async function listFunctionFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === GENERATED_DIRNAME || entry.name === "node_modules") {
          continue;
        }
        const nested = await listFunctionFiles(fullPath);
        files.push(...nested);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) {
        continue;
      }
      files.push(fullPath);
    }
    return files.sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function isConvoyFunction(value: unknown): value is { kind: "query" | "mutation" } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  return kind === "query" || kind === "mutation";
}

function isFunctionExport(value: unknown): value is FunctionExport {
  return Boolean(
    value &&
      typeof value === "object" &&
      "kind" in value &&
      "fullName" in value,
  );
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

function renderApiTree(tree: ApiTree, indent: string): string {
  const entries = Object.entries(tree).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return "{}";
  }
  const nextIndent = `${indent}  `;
  const lines = entries.map(([key, value]) => {
    if (isFunctionExport(value)) {
      const builder =
        value.kind === "query" ? "makeQueryRef" : "makeMutationRef";
      const ref = `${builder}("${value.fullName}", ${value.moduleVar}.${value.exportName})`;
      return `${nextIndent}${key}: ${ref}`;
    }
    return `${nextIndent}${key}: ${renderApiTree(value as ApiTree, nextIndent)}`;
  });
  return `{\n${lines.join(",\n")}\n${indent}}`;
}

function renderApiFile(
  modules: ModuleInfo[],
  tree: ApiTree,
  exportsList: FunctionExport[],
): string {
  if (exportsList.length === 0) {
    return `// Generated by convoy dev. Do not edit.\nexport const api = {} as const;\nexport type Api = typeof api;\n`;
  }
  const importLines = [
    `import { makeMutationRef, makeQueryRef } from "convoy/client";`,
    ...modules.map((mod) => `import * as ${mod.varName} from "${mod.importPath}";`),
  ];
  const apiBody = renderApiTree(tree, "");
  return `// Generated by convoy dev. Do not edit.\n${importLines.join("\n")}\n\nexport const api = ${apiBody} as const;\n\nexport type Api = typeof api;\n`;
}

function renderFunctionMap(
  exportsList: FunctionExport[],
  kind: "query" | "mutation",
): string {
  const entries = exportsList
    .filter((entry) => entry.kind === kind)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  if (entries.length === 0) {
    return "{}";
  }
  const lines = entries.map(
    (entry) => `  "${entry.fullName}": ${entry.moduleVar}.${entry.exportName}`,
  );
  return `{\n${lines.join(",\n")}\n}`;
}

function renderFunctionsFile(
  modules: ModuleInfo[],
  exportsList: FunctionExport[],
): string {
  if (exportsList.length === 0) {
    return `// Generated by convoy dev. Do not edit.\nexport const queries = {} as const;\nexport const mutations = {} as const;\nexport type QueryName = keyof typeof queries;\nexport type MutationName = keyof typeof mutations;\n`;
  }
  const importLines = modules.map(
    (mod) => `import * as ${mod.varName} from "${mod.importPath}";`,
  );
  const queries = renderFunctionMap(exportsList, "query");
  const mutations = renderFunctionMap(exportsList, "mutation");
  return `// Generated by convoy dev. Do not edit.\n${importLines.join("\n")}\n\nexport const queries = ${queries} as const;\n\nexport const mutations = ${mutations} as const;\n\nexport type QueryName = keyof typeof queries;\nexport type MutationName = keyof typeof mutations;\n`;
}

async function generateApi(rootDir: string): Promise<void> {
  const convoyDir = path.join(rootDir, "convoy");
  const functionsDir = path.join(convoyDir, FUNCTIONS_DIRNAME);
  const generatedDir = path.join(convoyDir, GENERATED_DIRNAME);
  await mkdir(functionsDir, { recursive: true });
  await mkdir(generatedDir, { recursive: true });

  const functionFiles = await listFunctionFiles(functionsDir);
  const modules: ModuleInfo[] = [];
  const exportsList: FunctionExport[] = [];
  let moduleIndex = 0;

  for (const filePath of functionFiles) {
    const relative = path.relative(functionsDir, filePath);
    const parsed = path.parse(relative);
    const segments = parsed.dir ? parsed.dir.split(path.sep).filter(Boolean) : [];
    if (parsed.name !== "index") {
      segments.push(parsed.name);
    }
    const moduleVar = `mod${moduleIndex}`;
    moduleIndex += 1;
    const importPath = toImportPath(generatedDir, filePath);
    modules.push({ filePath, importPath, varName: moduleVar, pathSegments: segments });

    const moduleUrl = pathToFileURL(filePath).href;
    const moduleExports = await import(moduleUrl);
    for (const [exportName, exported] of Object.entries(moduleExports)) {
      if (!isConvoyFunction(exported)) {
        continue;
      }
      const pathSegments = [...segments, exportName];
      const fullName = pathSegments.join(".");
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
  const functionsContent = renderFunctionsFile(modules, exportsList);

  await writeFile(path.join(generatedDir, "api.ts"), apiContent, "utf8");
  await writeFile(
    path.join(generatedDir, "functions.ts"),
    functionsContent,
    "utf8",
  );
}

async function generateServer(
  rootDir: string,
  schemaPath: string,
): Promise<void> {
  const convoyDir = path.join(rootDir, "convoy");
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

  await writeFile(path.join(generatedDir, "server.ts"), content, "utf8");
}

function quoteIdent(name: string): string {
  if (name.length === 0) {
    throw new Error("Database and table names cannot be empty");
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

async function loadSchemaModule(
  schemaPath: string
): Promise<Record<string, any>> {
  try {
    const moduleUrl = pathToFileURL(schemaPath).href;
    const schemaModule = await import(moduleUrl);
    const schema = schemaModule.default ?? schemaModule.schema;
    if (!schema || typeof schema !== "object") {
      throw new Error(
        "schema.ts must export a schema object (default or named)"
      );
    }
    return schema as Record<string, any>;
  } catch (error) {
    const isBun = Boolean(process.versions?.bun);
    const isTypeScript = schemaPath.endsWith(".ts");
    if (!isBun && isTypeScript) {
      throw new Error(
        "schema.ts is TypeScript. Run this with bun or with Node using a TS loader (tsx/ts-node)."
      );
    }
    throw error;
  }
}

function loadEnvFiles(rootDir: string): void {
  const rootEnv = path.join(rootDir, ".env");
  loadEnv({ path: rootEnv });

  const cwdEnv = path.join(process.cwd(), ".env");
  if (cwdEnv !== rootEnv) {
    loadEnv({ path: cwdEnv });
  }
}

async function ensureDatabase(databaseUrl: string): Promise<void> {
  const targetUrl = new URL(databaseUrl);
  const dbName = decodeURIComponent(targetUrl.pathname.replace(/^\//, ""));
  if (!dbName) {
    throw new Error("DATABASE_URL must include a database name");
  }

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";

  const adminClient = new Client({ connectionString: adminUrl.toString() });
  await adminClient.connect();
  const exists = await adminClient.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [dbName]
  );
  if (exists.rowCount === 0) {
    await adminClient.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
  }
  await adminClient.end();
}

async function ensureTables(
  databaseUrl: string,
  schema: Record<string, any>
): Promise<string[]> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  const createdTables: string[] = [];
  for (const [key, table] of Object.entries(schema)) {
    if (!table || typeof table !== "object") {
      throw new Error(`Invalid table definition for "${key}"`);
    }
    const tableName = String(table.name ?? key);
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        data jsonb NOT NULL DEFAULT '{}'::jsonb
      )`
    );
    const indexes = table.indexes ?? {};
    for (const [indexName, fields] of Object.entries(indexes)) {
      if (!Array.isArray(fields) || fields.length === 0) {
        continue;
      }
      const columnList = fields
        .map((field) => `(data->>${quoteLiteral(String(field))})`)
        .join(", ");
      await client.query(
        `CREATE INDEX IF NOT EXISTS ${quoteIdent(`${tableName}_${indexName}`)} ON ${quoteIdent(tableName)} (${columnList})`
      );
    }
    createdTables.push(tableName);
  }

  await client.end();
  return createdTables;
}

async function initCommand(options: CliOptions): Promise<void> {
  const rootDir = path.resolve(options.rootDir);
  const convoyDir = path.join(rootDir, "convoy");
  await mkdir(convoyDir, { recursive: true });

  const schemaPath = options.schemaPath
    ? path.resolve(rootDir, options.schemaPath)
    : path.join(convoyDir, "schema.ts");

  const schemaExists = await pathExists(schemaPath);
  if (!schemaExists) {
    await writeFile(schemaPath, SCHEMA_TEMPLATE, "utf8");
    console.log(`Created ${schemaPath}`);
  }

  loadEnvFiles(rootDir);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is missing. Add it to your environment or .env file."
    );
  }

  const schema = await loadSchemaModule(schemaPath);
  await ensureDatabase(databaseUrl);
  const tables = await ensureTables(databaseUrl, schema);
  console.log(`Synced ${tables.length} table(s): ${tables.join(", ")}`);
  await generateServer(rootDir, schemaPath);
  await generateApi(rootDir);
  console.log("Generated Convoy bindings");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "dev") {
    await initCommand(options);
    return;
  }

  throw new Error(`Unknown command: ${options.command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
