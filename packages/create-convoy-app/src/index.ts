import { copyFile, mkdir, readdir, readFile, writeFile, stat, access } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function log(message: string) {
  console.log(message);
}

function success(message: string) {
  console.log(`${colors.green}✔${colors.reset} ${message}`);
}

function error(message: string) {
  console.error(`${colors.red}✖${colors.reset} ${message}`);
}

function info(message: string) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${message}`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src: string, dest: string, replacements: Record<string, string>) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    let destName = entry.name;

    // Handle template files (e.g., package.json.tmpl -> package.json)
    if (destName.endsWith('.tmpl')) {
      destName = destName.slice(0, -5);
    }

    const destPath = join(dest, destName);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, replacements);
    } else {
      // Read file and replace placeholders
      let content = await readFile(srcPath, 'utf-8');

      for (const [key, value] of Object.entries(replacements)) {
        content = content.replaceAll(`{{${key}}}`, value);
      }

      await writeFile(destPath, content, 'utf-8');
    }
  }
}

async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

function printUsage() {
  log(`
${colors.bold}create-convoy-app${colors.reset} - Create a new Convoy application

${colors.bold}Usage:${colors.reset}
  npx create-convoy-app <project-name> [options]

${colors.bold}Options:${colors.reset}
  --skip-install    Skip npm install

${colors.bold}Examples:${colors.reset}
  npx create-convoy-app my-app
  npx create-convoy-app .
  npx create-convoy-app my-app --skip-install
`);
}

function printSuccess(projectName: string, targetDir: string, skipInstall: boolean) {
  const isCurrentDir = projectName === '.';
  const cdCommand = isCurrentDir ? '' : `  cd ${projectName}\n`;
  const installCommand = skipInstall ? '  npm install\n' : '';

  log(`
${colors.green}${colors.bold}Success!${colors.reset} Created ${colors.cyan}${isCurrentDir ? 'convoy app' : projectName}${colors.reset} at ${colors.dim}${targetDir}${colors.reset}

${colors.bold}Next steps:${colors.reset}
${cdCommand}${installCommand}  npx convoy dev      ${colors.dim}# Start Convoy server + watch for changes${colors.reset}
  npm run dev         ${colors.dim}# Start Vite dev server (in another terminal)${colors.reset}

Then open ${colors.cyan}http://localhost:5173${colors.reset}

${colors.bold}Documentation:${colors.reset}
  ${colors.dim}https://github.com/hamzatekin/convoy${colors.reset}
`);
}

export async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const projectName = args.find((arg) => !arg.startsWith('--'));
  const skipInstall = args.includes('--skip-install');

  // Show help
  if (args.includes('--help') || args.includes('-h') || !projectName) {
    printUsage();
    process.exit(projectName ? 0 : 1);
  }

  // Validate project name
  if (projectName !== '.' && !/^[a-z0-9-_]+$/i.test(projectName)) {
    error(`Invalid project name: "${projectName}"`);
    log('Project name can only contain letters, numbers, hyphens, and underscores.');
    process.exit(1);
  }

  // Determine target directory
  const targetDir = projectName === '.' ? process.cwd() : join(process.cwd(), projectName);

  // Check if directory exists and is not empty
  if (projectName !== '.') {
    if (await exists(targetDir)) {
      const entries = await readdir(targetDir);
      if (entries.length > 0) {
        error(`Directory "${projectName}" already exists and is not empty.`);
        process.exit(1);
      }
    }
  }

  // Find template directory
  const templateDir = join(__dirname, '..', 'template');
  if (!(await exists(templateDir))) {
    error('Template directory not found. This is a bug in create-convoy-app.');
    process.exit(1);
  }

  // Create project
  info(`Creating project in ${colors.cyan}${targetDir}${colors.reset}...`);

  const replacements = {
    PROJECT_NAME: projectName === '.' ? basename(process.cwd()) : projectName,
  };

  await copyDir(templateDir, targetDir, replacements);
  success('Project files created');

  // Install dependencies
  if (!skipInstall) {
    info('Installing dependencies...');
    try {
      await runCommand('npm', ['install'], targetDir);
      success('Dependencies installed');
    } catch (err) {
      error('Failed to install dependencies. You can run "npm install" manually.');
    }
  }

  // Print success message
  printSuccess(projectName, targetDir, skipInstall);
}
