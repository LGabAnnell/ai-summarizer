import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const __dirname = path.resolve();

/**
 * Packages the source code into a zip file for Mozilla add-on submission.
 * 
 * Mozilla requires source code submission that includes:
 * - All source code files
 * - Step-by-step build instructions (in README.md)
 * - Build scripts
 * - OS and build environment requirements
 * - Required version and installation instructions for any programs used
 * 
 * This script creates a zip file containing all source files, excluding:
 * - node_modules/
 * - dist/
 * - .git/
 * - .zip files
 * - Temporary files and IDE directories
 */
async function packageSource() {
  console.log('Packaging source code for Mozilla add-on submission...');

  const outputFile = path.join(__dirname, 'ai-summarizer-source.zip');
  
  // Remove existing zip file if it exists
  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
    console.log(`Removed existing ${outputFile}`);
  }

  // First, create a file list to include in the archive
  // This avoids the race condition where tar reads files while the script runs
  const fileList = getFilesToInclude(__dirname);
  
  // Write the file list to a temporary file for tar to read
  const fileListPath = path.join(__dirname, '.source-filelist.txt');
  fs.writeFileSync(fileListPath, fileList.join('\n'));

  try {
    // Use tar to create a .tar.gz file from the file list
    // Note: .tar.gz is widely accepted; if .zip is strictly required,
    // install zip utility or use: npm install -g zip-cli
    console.log('Creating source archive...');
    console.log(`Including ${fileList.length} files and directories`);
    
    const command = `tar -czf ${outputFile} -T ${fileListPath}`;
    console.log(`Running: ${command}`);
    
    execSync(command, { 
      cwd: __dirname,
      stdio: 'inherit',
      shell: true
    });

    console.log(`\nSource code packaged successfully to: ${outputFile}`);
    console.log('\n=== Mozilla Submission Notes ===');
    console.log('This archive contains:');
    console.log('- All TypeScript, HTML, CSS, and SCSS source files');
    console.log('- Angular project configuration');
    console.log('- Extension manifest and core files');
    console.log('- Build scripts and instructions');
    console.log('- README.md with build instructions and requirements');
    console.log('\nBuild instructions are in README.md');
    console.log('Required tools: Node.js v18+, npm v9+, Angular CLI v22+');
    console.log('\nTo build the extension:');
    console.log('  npm install');
    console.log('  npm run build');
    console.log('  npm run package');
    
    // Verify the file was created
    if (fs.existsSync(outputFile)) {
      const stats = fs.statSync(outputFile);
      console.log(`\nArchive size: ${formatBytes(stats.size)}`);
    } else {
      console.error('Error: Archive file was not created');
      process.exit(1);
    }

  } catch (error) {
    console.error('Error packaging source code:', error);
    console.log('\nAlternative: Install zip utility and use:');
    console.log('  zip -r ai-summarizer-source.zip . -x node_modules/* .git/* dist/* *.zip');
    process.exit(1);
  } finally {
    // Clean up the temporary file list
    if (fs.existsSync(fileListPath)) {
      fs.unlinkSync(fileListPath);
    }
  }
}

/**
 * Recursively gets all files and directories to include in the source archive.
 * Excludes node_modules, dist, .git, and other build/temporary files.
 */
function getFilesToInclude(dir: string): string[] {
  const result: string[] = [];
  
  // Always include the directory entries first
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(__dirname, fullPath);

    // Skip excluded directories and files
    if (shouldExclude(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      // Add the directory itself
      result.push(relativePath + path.sep);
      // Recursively add its contents
      result.push(...getFilesToInclude(fullPath));
    } else if (entry.isFile()) {
      result.push(relativePath);
    }
  }

  return result;
}

/**
 * Checks if a file or directory should be excluded from the source archive.
 */
function shouldExclude(name: string): boolean {
  const excluded = [
    'node_modules',
    '.git',
    'dist',
    '.DS_Store',
    'Thumbs.db',
    '.idea',
    '.vscode',
    '.angular',
    'tmp',
    'temp',
    'coverage',
    '.web-ext',
    'package-lock.json',
    'ai-summarizer-source.zip',
    'ai-summarizer.zip',
    '.source-filelist.txt',
  ];

  return excluded.includes(name);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

packageSource();
