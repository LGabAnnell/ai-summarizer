import esbuild from 'esbuild';
import path from 'path';
import { spawnSync } from 'child_process';

const __dirname = path.resolve();

const buildConfig: esbuild.BuildOptions = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  sourcemap: false
};

// Type-check extension-core against tsconfig.extension.json.
// esbuild only transpiles; it does not enforce compilerOptions like
// strict, noUnusedLocals, noImplicitAny, etc. Run tsc --noEmit first
// so the build fails on type errors.
function typeCheck(): void {
  const result = spawnSync(
    'npx',
    ['tsc', '--noEmit', '-p', path.resolve(__dirname, 'tsconfig.extension.json')],
    { stdio: 'inherit', shell: true },
  );
  if (result.status !== 0) {
    console.error('Type-check failed. Aborting extension build.');
    process.exit(1);
  }
}

// Build background service worker
function getBackgroundConfig(debug: boolean): esbuild.BuildOptions {
  return {
    ...buildConfig,
    entryPoints: [path.join(__dirname, 'extension-core/background.ts')],
    outfile: path.join(__dirname, 'dist/background.js'),
    sourcemap: debug,
    define: {
      global: 'globalThis',
    },
    tsconfig: path.resolve(__dirname + '/tsconfig.json'),
  };
}

// Build content script
function getContentConfig(_: boolean): esbuild.BuildOptions {
  return {
    ...buildConfig,
    entryPoints: [path.join(__dirname, 'extension-core/content/content.ts')],
    outfile: path.join(__dirname, 'dist/content.js'),
    define: {
      global: 'globalThis',
    },
    tsconfig: path.resolve(__dirname + '/tsconfig.json'),
  };
}

async function buildExtension(debug: boolean = false) {
  console.log(`Building extension core... (debug: ${debug})`);

  // Fail fast on type errors before esbuild strips types.
  typeCheck();

  const backgroundConfig = getBackgroundConfig(debug);
  const contentConfig = getContentConfig(debug);
  
  try {
    // Build background
    console.log('Building background.js...');
    await esbuild.build(backgroundConfig);
    console.log('Background built successfully');

    // Build content script
    console.log('Building content.js...');
    await esbuild.build(contentConfig);
    console.log('Content script built successfully');

    console.log('Extension core built successfully!');
  } catch (error) {
    console.error('Error building extension core:', error);
    process.exit(1);
  }
}

// Check for debug mode via environment variable or CLI argument
const args = process.argv.slice(2);
const debugMode = args.includes('--debug') || process.env['DEBUG_BUILD'] === 'true';

buildExtension(debugMode).then(() => console.log("done"));
