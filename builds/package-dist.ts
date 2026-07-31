import fs from 'fs';
import path from 'path';

const __dirname = path.resolve();

const filesToCopy = [
  { src: 'manifest.json', dest: 'dist/manifest.json' },
  { src: 'icons/icon-48.svg', dest: 'dist/icons/icon-48.svg' },
  { src: 'icons/icon-96.svg', dest: 'dist/icons/icon-96.svg' },
];

// Copy popup and options folders from Angular builds
const foldersToCopy = [
  { src: 'dist/popup', dest: 'dist/popup' },
  { src: 'dist/options', dest: 'dist/options' },
];

async function packageDist() {
  console.log('Packaging dist folder...');

  try {
    // Ensure dist directory exists
    const distPath = path.join(__dirname, 'dist');
    if (!fs.existsSync(distPath)) {
      fs.mkdirSync(distPath, { recursive: true });
    }

    // Ensure icons directory exists
    const iconsPath = path.join(distPath, 'icons');
    if (!fs.existsSync(iconsPath)) {
      fs.mkdirSync(iconsPath, { recursive: true });
    }

    // Copy individual files
    for (const file of filesToCopy) {
      const srcPath = path.join(__dirname, file.src);
      const destPath = path.join(__dirname, file.dest);
      
      if (fs.existsSync(srcPath)) {
        // Ensure destination directory exists
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied ${file.src} to ${file.dest}`);
      } else {
        console.warn(`Warning: Source file not found: ${srcPath}`);
      }
    }

    // Copy folders (popup and options from Angular builds)
    for (const folder of foldersToCopy) {
      const srcPath = path.join(__dirname, folder.src);
      const destPath = path.join(__dirname, folder.dest);
      
      if (fs.existsSync(srcPath)) {
        // Angular 19 outputs to a 'browser' subdirectory, so we need to flatten the structure
        const browserPath = path.join(srcPath, 'browser');
        if (fs.existsSync(browserPath)) {
          // Copy contents from browser/ to the destination
          copyFolderContents(browserPath, destPath);
          console.log(`Copied ${browserPath}/* to ${folder.dest}/`);
          
          // Remove the browser directory as it's now flattened
          fs.rmSync(browserPath, { recursive: true, force: true });
          console.log(`Removed redundant ${browserPath}`);
        } else {
          // Fallback: copy recursively
          copyFolderRecursiveSync(srcPath, destPath);
          console.log(`Copied ${folder.src} to ${folder.dest}`);
        }
      } else {
        console.warn(`Warning: Source folder not found: ${srcPath}`);
      }
    }

    // Update manifest.json to use correct paths and Firefox-compatible syntax
    const manifestPath = path.join(distPath, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      
      // The popup and options should already be in the right place from Angular builds
      // But we need to make sure the paths are correct
      manifest.action.default_popup = 'popup/index.html';
      manifest.options_ui.page = 'options/index.html';
      
      // Firefox uses "scripts" instead of "service_worker" for background
      if (manifest.background && manifest.background.service_worker) {
        manifest.background.scripts = [manifest.background.service_worker];
        delete manifest.background.service_worker;
      }
      
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log('Updated manifest.json paths and Firefox compatibility');
    }

    console.log('Packaging completed successfully!');
  } catch (error) {
    console.error('Error packaging dist:', error);
    process.exit(1);
  }
}

function copyFolderContents(source: string, target: string) {
  // Ensure target directory exists
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const files = fs.readdirSync(source);
  
  for (const file of files) {
    const sourcePath = path.join(source, file);
    const targetPath = path.join(target, file);
    
    const stats = fs.statSync(sourcePath);
    
    if (stats.isDirectory()) {
      copyFolderRecursiveSync(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function copyFolderRecursiveSync(source: string, target: string) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const files = fs.readdirSync(source);
  
  for (const file of files) {
    const sourcePath = path.join(source, file);
    const targetPath = path.join(target, file);
    
    const stats = fs.statSync(sourcePath);
    
    if (stats.isDirectory()) {
      copyFolderRecursiveSync(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

packageDist();
