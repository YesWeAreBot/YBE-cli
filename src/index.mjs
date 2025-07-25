#!/usr/bin/env node
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import replace from 'replace-in-file';
import chalk from 'chalk';
import { copyTemplate, updatePackageJson } from './utils.mjs';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

console.log(chalk.cyan.bold('\n🚀🚀🚀🚀 欢迎使用 YesImBot 扩展脚手架工具 🚀🚀🚀🚀🚀🚀🚀'));

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
    console.log(chalk.green(`\n📁📁📁📁 创建项目目录: ${projectName}`));
    
    // 复制模板文件
    await copyTemplate('base', projectPath);
    await copyTemplate('extension', path.join(projectPath, 'src'));
    
    // 生成 PascalCase 类名 (首字母大写)
    const className = answers.friendlyName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
    
    // 模板变量替换
    const replaceOptions = {
      files: [
        path.join(projectPath, 'src/index.ts'),
        path.join(projectPath, 'README.md'),
        path.join(projectPath, 'package.json')
      ],
      from: [
        /{{name}}/g,
        /{{friendlyName}}/g,
        /{{description}}/g,
        /{{ClassName}}/g,
        /{{fullPackageName}}/g
      ],
      to: [
        answers.extensionName,
        answers.friendlyName,
        answers.description,
        className,
        fullPackageName
      ]
    };
    
    await replace.replaceInFile(replaceOptions);
    
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
        "extension",
        "yesimbot"
      ]
    });
    
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
