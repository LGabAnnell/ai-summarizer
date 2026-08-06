import esbuild from 'esbuild';
import path from 'path';

const __dirname = path.resolve();

const buildConfig: esbuild.BuildOptions = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  sourcemap: false,
};

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
  };
}

// Build content script
function getContentConfig(debug: boolean): esbuild.BuildOptions {
  return {
    ...buildConfig,
    entryPoints: [path.join(__dirname, 'extension-core/content/content.ts')],
    outfile: path.join(__dirname, 'dist/content.js'),
    define: {
      global: 'globalThis',
    },
  };
}

async function buildExtension(debug: boolean = false) {
  console.log(`Building extension core... (debug: ${debug})`);
  
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
const debugMode = args.includes('--debug') || process.env.DEBUG_BUILD === 'true';

buildExtension(debugMode);
