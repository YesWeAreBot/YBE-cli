const fs = require('fs-extra');
const path = require('path');

const templateDir = path.join(__dirname, 'templates');

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

module.exports = {
  copyTemplate,
  updatePackageJson
};
