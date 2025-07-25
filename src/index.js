#!/usr/bin/env node
const inquirer = require('inquirer');
const fs = require('fs-extra');
const path = require('path');
const replace = require('replace-in-file');
const chalk = require('chalk');
const { copyTemplate, updatePackageJson } = require('./utils');

console.log(chalk.cyan.bold('\n🚀🚀 欢迎使用 YesImBot 扩展脚手架工具 🚀🚀🚀'));

const questions = [
  {
    type: 'input',
    name: 'extensionName',
    message: '请输入扩展名称 (kebab-case 格式):',
    validate: input => /^[a-z0-9-]+$/.test(input) || '名称必须使用 kebab-case 格式 (小写字母、数字、连字符)'
  },
  {
    type: 'input',
    name: 'friendlyName',
    message: '请输入显示名称:',
    default: answers => `${answers.extensionName.replace(/-/g, ' ')}`
  },
  {
    type: 'input',
    name: 'description',
    message: '请输入扩展描述:'
  },
  {
    type: 'list',
    name: 'extensionType',
    message: '请选择扩展类型:',
    choices: [
      '标准工具扩展',
      '资源管理扩展',
      'MCP 集成扩展'
    ],
    default: '标准工具扩展'
  },
  {
    type: 'confirm',
    name: 'confirmCreate',
    message: '确认使用以上设置创建扩展?',
    default: true
  }
];

inquirer.prompt(questions).then(async answers => {
  if (!answers.confirmCreate) {
    console.log(chalk.yellow('\n扩展创建已取消'));
    return;
  }

  const projectName = answers.extensionName;
  const fullPackageName = `koishi-plugin-yesimbot-extension-${projectName}`;
  const projectPath = path.join(process.cwd(), projectName);
  
  try {
    // 创建项目目录
    if (fs.existsSync(projectPath)) {
      console.log(chalk.red(`\n错误: 目录 "${projectName}" 已存在!`));
      return;
    }
    
    fs.mkdirSync(projectPath);
    console.log(chalk.green(`\n📁📁 创建项目目录: ${projectName}`));
    
    // 复制模板文件
    await copyTemplate('base', projectPath);
    await copyTemplate('extension', path.join(projectPath, 'src'));
    
    // 使用用户输入更新 package.json
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
        answers.extensionType.includes('资源') ? "resource" : "extension",
        "yesimbot"
      ]
    });
    
    // 更新 README.md
    await replace.replaceInFile({
      files: path.join(projectPath, 'README.md'),
      from: ['{{extensionName}}', '{{description}}'],
      to: [answers.friendlyName, answers.description]
    });
    
    // 根据扩展类型更新 index.ts
    const indexPath = path.join(projectPath, 'src/index.ts');
    let indexContent = fs.readFileSync(indexPath, 'utf-8');
    
    if (answers.extensionType.includes('资源')) {
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
    description: '管理特定资源',
    parameters: Schema.object({
      resource_id: Schema.string().required().description('资源ID'),
      action: Schema.union(['add', 'remove', 'update']).required().description('执行操作')
    })
  })
  async manageResource({ resource_id, action }: { resource_id: string; action: string }) {
    // 在此实现资源管理逻辑
    return { status: 'success', message: \`资源 \${resource_id} \${action} 操作成功\` };
  }`;
    }
    
    fs.writeFileSync(indexPath, indexContent);
    
    console.log(chalk.green(`✅ 成功创建 "${answers.friendlyName}" 扩展!`));
    console.log(chalk.blue('\n后续步骤:'));
    console.log(`  cd ${projectName}`);
    console.log('  bun install');
    console.log('  bun dev\n');
    
    console.log(chalk.yellow('请记得:'));
    console.log('  1. 在 src/index.ts 中添加扩展逻辑');
    console.log('  2. 更新 README.md 中的使用说明');
    console.log('  3. 使用 bun add <package> 添加额外依赖\n');
    
  } catch (error) {
    console.error(chalk.red('\n创建扩展时出错:'), error);
    if (fs.existsSync(projectPath)) {
      fs.rmdirSync(projectPath, { recursive: true });
    }
  }
});
