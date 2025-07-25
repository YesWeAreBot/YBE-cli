import fs from 'fs-extra';
import path from 'path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const templateDir = path.join(__dirname, '../templates');

async function copyTemplate(templateName, destPath) {
  const sourcePath = path.join(templateDir, templateName);
  await fs.copy(sourcePath, destPath);
}

async function updatePackageJson(packageJsonPath, updates) {
  let packageJson = await fs.readJson(packageJsonPath);
  
  // Merge updates into package.json
  packageJson = {
    ...packageJson,
    ...updates,
    keywords: [
      ...(packageJson.keywords || []),
      ...(updates.keywords || [])
    ],
    scripts: {
      ...(packageJson.scripts || {}),
      ...(updates.scripts || {})
    }
  };
  
  await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
}

export { copyTemplate, updatePackageJson };

