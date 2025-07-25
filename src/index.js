#!/usr/bin/env node
const inquirer = require('inquirer');
const fs = require('fs-extra');
const path = require('path');
const replace = require('replace-in-file');
const chalk = require('chalk');
const { copyTemplate, updatePackageJson } = require('./utils');

console.log(chalk.cyan.bold('\n🚀 Welcome to YesImBot Extension Scaffolder 🚀'));

const questions = [
  {
    type: 'input',
    name: 'extensionName',
    message: 'Enter your extension name (kebab-case):',
    validate: input => /^[a-z0-9-]+$/.test(input) || 'Name must be kebab-case (lowercase, numbers, hyphens)'
  },
  {
    type: 'input',
    name: 'friendlyName',
    message: 'Enter a friendly display name for your extension:',
    default: answers => `${answers.extensionName.replace(/-/g, ' ')}`
  },
  {
    type: 'input',
    name: 'description',
    message: 'Enter a short description for your extension:'
  },
  {
    type: 'list',
    name: 'extensionType',
    message: 'Select extension type:',
    choices: [
      'Standard Tool Extension',
      'Resource Management Extension',
      'MCP Integration Extension'
    ],
    default: 'Standard Tool Extension'
  },
  {
    type: 'confirm',
    name: 'confirmCreate',
    message: 'Create extension with these settings?',
    default: true
  }
];

inquirer.prompt(questions).then(async answers => {
  if (!answers.confirmCreate) {
    console.log(chalk.yellow('\nExtension creation cancelled.'));
    return;
  }

  const projectName = answers.extensionName;
  const fullPackageName = `koishi-plugin-yesimbot-extension-${projectName}`;
  const projectPath = path.join(process.cwd(), projectName);
  
  try {
    // Create project directory
    if (fs.existsSync(projectPath)) {
      console.log(chalk.red(`\nError: Directory "${projectName}" already exists!`));
      return;
    }
    
    fs.mkdirSync(projectPath);
    console.log(chalk.green(`\n📁 Created project directory: ${projectName}`));
    
    // Copy template files
    await copyTemplate('base', projectPath);
    await copyTemplate('extension', path.join(projectPath, 'src'));
    
    // Update package.json with user inputs
    const packageJsonPath = path.join(projectPath, 'package.json');
    await updatePackageJson(packageJsonPath, {
      name: fullPackageName,
      description: answers.description,
      scripts: {
        build: "tsc && node esbuild.config.mjs",
        dev: "tsc -w --preserveWatchOutput",
        lint: "eslint . --ext .ts",
        clean: "rm -rf lib .turbo tsconfig.tsbuildinfo *.tgz",
        pack: "bun pm pack"
      },
      keywords: [
        "koishi",
        "plugin",
        answers.extensionType.includes('Resource') ? "resource" : "extension",
        "yesimbot"
      ]
    });
    
    // Update README.md
    await replace.replaceInFile({
      files: path.join(projectPath, 'README.md'),
      from: ['{{extensionName}}', '{{description}}'],
      to: [answers.friendlyName, answers.description]
    });
    
    // Update index.ts based on extension type
    const indexPath = path.join(projectPath, 'src/index.ts');
    let indexContent = fs.readFileSync(indexPath, 'utf-8');
    
    if (answers.extensionType.includes('Resource')) {
      indexContent = indexContent.replace(
        "import { Extension, Tool } from 'koishi-plugin-yesimbot/services';",
        `import { Extension, Tool } from 'koishi-plugin-yesimbot/services';
import { AssetService } from 'koishi-plugin-yesimbot/services';`
      );
      
      indexContent = indexContent.replace(
        /class \w+Extension/g,
        `class ${answers.friendlyName.replace(/\s+/g, '')}Extension`
      );
      
      indexContent += `
  @Tool({
    name: 'manage_resource',
    description: 'Manage a specific resource',
    parameters: Schema.object({
      resource_id: Schema.string().required().description('Resource ID'),
      action: Schema.union(['add', 'remove', 'update']).required().description('Action to perform')
    })
  })
  async manageResource({ resource_id, action }: { resource_id: string; action: string }) {
    // Implement your resource management logic here
    return { status: 'success', message: \`Resource \${resource_id} \${action}d successfully\` };
  }`;
    }
    
    fs.writeFileSync(indexPath, indexContent);
    
    console.log(chalk.green(`✅ Successfully created "${answers.friendlyName}" extension!`));
    console.log(chalk.blue('\nNext steps:'));
    console.log(`  cd ${projectName}`);
    console.log('  bun install');
    console.log('  bun dev\n');
    
    console.log(chalk.yellow('Remember to:'));
    console.log('  1. Add your extension logic in src/index.ts');
    console.log('  2. Update README.md with usage instructions');
    console.log('  3. Add any additional dependencies with bun add <package>\n');
    
  } catch (error) {
    console.error(chalk.red('\nError creating extension:'), error);
    if (fs.existsSync(projectPath)) {
      fs.rmdirSync(projectPath, { recursive: true });
    }
  }
});
