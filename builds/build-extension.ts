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
const backgroundConfig: esbuild.BuildOptions = {
  ...buildConfig,
  entryPoints: [path.join(__dirname, 'extension-core/background.ts')],
  outfile: path.join(__dirname, 'dist/background.js'),
  define: {
    global: 'globalThis',
  },
};

// Build content script
const contentConfig: esbuild.BuildOptions = {
  ...buildConfig,
  entryPoints: [path.join(__dirname, 'extension-core/content/content.ts')],
  outfile: path.join(__dirname, 'dist/content.js'),
  define: {
    global: 'globalThis',
  },
};

async function buildExtension() {
  console.log('Building extension core...');
  
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

buildExtension();
