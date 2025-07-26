#!/usr/bin/env node
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import replace from 'replace-in-file';
import chalk from 'chalk';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import axios from 'axios';
import AdmZip from 'adm-zip';

// 正确获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

console.log(chalk.hex('#FF6B6B').bold(`
██╗╗   ███╗╗██████╗╗ ████████╗╗
╚╚██╗╗ ███╔╔╝╝██╔╔══██╗╗██╔╔════╝╝
 ╚╚╚████╔╔╝╝ ███████╔╔╝╝█████╗╗  
  ╚╚╚██╔╔╝╝  ███╔╔══██╗╗██╔╔══╝╝  
   ███║║   ███████╔╔╝╝███████╗╗
   ╚╚╚═╝╝   ╚╚╚═════╝╝ ╚╚╚══════╝╝
YesImBot 扩展脚手架工具 v1.1.0
`));

// 检查 Bun 是否安装并自动安装
async function ensureBunInstalled() {
    try {
        await execAsync('bun --version');
        console.log(chalk.green('✅ Bun 已安装'));
        return true;
    } catch (error) {
        console.log(chalk.yellow('⚠️ 未检测到 Bun 包管理工具'));
        
        // 询问用户是否自动安装
        const answer = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'installBun',
                message: '是否要自动安装 Bun?',
                default: true
            }
        ]);
        
        if (!answer.installBun) {
            console.log(chalk.red('请手动安装 Bun: https://bun.sh'));
            return false;
        }
        
        // 尝试安装 Bun
        console.log(chalk.hex('#4ECDC4')('⬇⬇️  正在安装 Bun...'));
        console.log(chalk.hex('#FFD166')('这可能需要几分钟时间，请耐心等待...'));
        
        try {
            // 优先使用 npm 安装
            console.log(chalk.hex('#F7B801')('  尝试使用 npm 安装...'));
            try {
                // 检查 npm 是否可用
                await execAsync('npm --version');
                
                // 使用 npm 安装 Bun
                console.log(chalk.hex('#F7B801')('  使用 npm 安装 Bun...'));
                await execAsync('npm install -g bun');
                
                // 验证安装
                console.log(chalk.hex('#F7B801')('  验证安装...'));
                const { stdout } = await execAsync('bun --version');
                console.log(chalk.green(`✅ Bun 安装成功! 版本: ${stdout.trim()}`));
                return true;
            } catch (npmError) {
                console.log(chalk.red('  npm 安装失败，请尝试使用 `sudo ybe`。尝试使用官方安装脚本，可能较慢...'));
            }
            
            // 回退到官方安装脚本
            console.log(chalk.hex('#F7B801')('  使用官方安装脚本...'));
            await execAsync('curl -fsSL https://bun.sh/install | bash');
            
            // 更新 PATH 环境变量
            console.log(chalk.hex('#F7B801')('  更新环境变量...'));
            if (process.env.SHELL?.includes('zsh')) {
                await execAsync('echo \'export BUN_INSTALL="$HOME/.bun"\' >> ~/.zshrc');
                await execAsync('echo \'export PATH="$BUN_INSTALL/bin:$PATH"\' >> ~/.zshrc');
                await execAsync('source ~/.zshrc');
            } else {
                await execAsync('echo \'export BUN_INSTALL="$HOME/.bun"\' >> ~/.bashrc');
                await execAsync('echo \'export PATH="$BUN_INSTALL/bin:$PATH"\' >> ~/.bashrc');
                await execAsync('source ~/.bashrc');
            }
            
            // 验证安装
            console.log(chalk.hex('#F7B801')('  验证安装...'));
            const { stdout } = await execAsync('bun --version');
            console.log(chalk.green(`✅ Bun 安装成功! 版本: ${stdout.trim()}`));
            
            return true;
        } catch (installError) {
            console.error(chalk.red('❌❌ Bun 安装失败:'), installError);
            
            // 提供详细的安装指南
            console.log(chalk.yellow('\n请尝试手动安装:'));
            console.log('  1. 使用 npm:');
            console.log(chalk.hex('#4ECDC4')('     npm install -g bun'));
            console.log('  2. 使用 curl:');
            console.log(chalk.hex('#4ECDC4')('     curl -fsSL https://bun.sh/install | bash'));
            console.log('  3. 使用 Homebrew:');
            console.log(chalk.hex('#4ECDC4')('     brew tap oven-sh/bun'));
            console.log(chalk.hex('#4ECDC4')('     brew install bun'));
            console.log('  4. 官方文档: https://bun.sh/docs/installation');
            
            return false;
        }
    }
}

// 格式化字节大小
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 下载函数
async function downloadFile(url, outputPath) {
    try {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            timeout: 300000, // 5分钟超时
        });
        
        const writer = fs.createWriteStream(outputPath);
        const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
        let downloadedBytes = 0;
        let lastProgress = 0;
        
        // 更新下载进度
        const updateProgress = () => {
            const percent = Math.floor((downloadedBytes / totalBytes) * 100);
            if (percent > lastProgress) {
                console.log(chalk.hex('#4ECDC4')(`  🚚🚚🚚 下载进度: ${percent}% (${formatBytes(downloadedBytes)}/${formatBytes(totalBytes)})`));
                lastProgress = percent;
            }
        };
        
        // 设置进度更新间隔
        const progressInterval = setInterval(updateProgress, 500);
        
        // 更新下载字节数
        response.data.on('data', (chunk) => {
            downloadedBytes += chunk.length;
        });
        
        // 将响应流管道到文件写入流
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                clearInterval(progressInterval);
                updateProgress();
                console.log(chalk.green('  ✅ 下载完成!'));
                resolve();
            });
            
            writer.on('error', (err) => {
                clearInterval(progressInterval);
                reject(new Error(`文件写入失败: ${err.message}`));
            });
            
            response.data.on('error', (err) => {
                clearInterval(progressInterval);
                reject(new Error(`下载流错误: ${err.message}`));
            });
        });
    } catch (error) {
        throw new Error(`下载请求失败: ${error.message}`);
    }
}

// 构建核心包
async function buildYesImBot() {
    console.log(chalk.hex('#FF6B6B').bold('\n🔧🔧 开始构建 YesImBot 核心包...'));
    
    // 创建专用构建目录
    const tempDir = path.join(os.homedir(), '.ybe-build', Date.now().toString());
    const zipPath = path.join(tempDir, 'YesImBot-dev.zip');
    let repoUrl = '';
    
    try {
        // 确保使用全新的临时目录
        fs.mkdirSync(tempDir, { recursive: true });
        
        // 下载最新 dev 分支
        console.log(chalk.hex('#4ECDC4')('⬇⬇️  正在下载 YesImBot dev 分支...'));
        
        // 提供中国大陆可用的镜像
        const mirrorUrl = process.env.YBE_MIRROR || 'https://github.akams.cn/https://github.com';
        repoUrl = `${mirrorUrl}/YesWeAreBot/YesImBot/archive/refs/heads/dev.zip`;
        
        // 下载文件
        await downloadFile(repoUrl, zipPath);
        
        // 验证下载文件
        const stats = fs.statSync(zipPath);
        if (stats.size === 0) {
            throw new Error('下载的文件大小为0，可能是下载失败');
        }
        console.log(chalk.green(`✅ 下载完成! 文件大小: ${formatBytes(stats.size)}`));
        
        // 解压文件
        console.log(chalk.hex('#4ECDC4')('📦📦 正在解压文件...'));
        const zip = new AdmZip(zipPath);
        const extracted = zip.getEntries().length;
        
        // 解压到临时目录
        zip.extractAllTo(tempDir, true);
        console.log(chalk.green(`✅ 解压完成，共提取 ${extracted} 个文件`));
        
        // 找到解压后的目录
        const files = fs.readdirSync(tempDir);
        const extractedDir = files.find(name => name.startsWith('YesImBot-dev'));
        
        if (!extractedDir) {
            throw new Error(`解压后找不到 YesImBot-dev 目录。找到的文件: ${files.join(', ')}`);
        }
        
        const projectPath = path.join(tempDir, extractedDir);
        
        // 安装依赖并构建
        console.log(chalk.hex('#FF6B6B').bold('\n🔨🔨 安装依赖并构建核心包...'));
        
        // 确保 Bun 已安装
        const bunInstalled = await ensureBunInstalled();
        if (!bunInstalled) {
            throw new Error('Bun 未安装，无法继续构建');
        }
        
        // 在项目目录中创建 package.json 以解决工作区问题
        const tempPackageJson = path.join(projectPath, 'package.json');
        if (!fs.existsSync(tempPackageJson)) {
            fs.writeFileSync(tempPackageJson, JSON.stringify({
                name: 'yesimbot-core-temp',
                private: true,
                workspaces: [] // 明确指定空工作区
            }, null, 2));
        }
        
        // 创建空 yarn.lock 文件 (如果不存在)
        const yarnLockPath = path.join(projectPath, 'yarn.lock');
        if (!fs.existsSync(yarnLockPath)) {
            fs.writeFileSync(yarnLockPath, '');
        }
        
        // 安装依赖
        console.log(chalk.hex('#4ECDC4')('🧩🧩 安装依赖...'));
        execSync('bun install', { 
            stdio: 'inherit', 
            cwd: projectPath 
        });
        
        // 构建核心包
        console.log(chalk.hex('#4ECDC4')('🔨🔨 构建核心包...'));
        execSync('bun run build', { 
            stdio: 'inherit', 
            cwd: projectPath 
        });
        
        // 读取核心包版本
        const corePackageJsonPath = path.join(projectPath, 'packages/core/package.json');
        const corePackage = JSON.parse(fs.readFileSync(corePackageJsonPath, 'utf-8'));
        console.log(chalk.green(`✅ 核心包版本: ${corePackage.version}`));
        
        // 返回核心包路径
        return path.join(projectPath, 'packages/core');
    } catch (error) {
        console.error(chalk.red('\n❌❌ 构建过程中出错:'));
        console.error(error);
        
        // 提供用户可操作的解决方案
        console.log(chalk.hex('#FF6B6B').bold('\n🛠🛠🛠️ 可能的解决方案:'));
        console.log('1. 检查网络连接');
        console.log('2. 尝试设置镜像: export YBE_MIRROR=https://github.akams.cn');
        console.log('3. 手动下载源码:');
        console.log(chalk.hex('#4ECDC4')(`   curl -L ${repoUrl} -o ${zipPath}`));
        console.log('4. 手动构建:');
        console.log(chalk.hex('#4ECDC4')(`   unzip ${zipPath} -d ${tempDir}`));
        console.log(chalk.hex('#4ECDC4')(`   cd ${tempDir}/YesImBot-dev`));
        console.log(chalk.hex('#4ECDC4')(`   bun install && bun run build`));
        
        throw error;
    }
}

// 自动构建核心包
async function autoBuildCore(projectPath) {
    console.log(chalk.hex('#FF6B6B').bold('\n🌍🌍 检测到您在外部开发，需要构建 YesImBot 核心包'));
    console.log(chalk.hex('#FFD166')('⏳⏳⏳ 这可能需要几分钟时间，请耐心等待...'));
    
    try {
        // 1. 构建核心包
        console.log(chalk.hex('#4ECDC4').bold('\n🚧🚧 步骤 1/3: 构建 YesImBot 核心包'));
        const corePath = await buildYesImBot();
        console.log(chalk.green(`✅ 核心包构建成功! 位置: ${corePath}`));
        
        // 2. 进入项目目录
        console.log(chalk.hex('#4ECDC4').bold('\n📂📂 步骤 2/3: 进入项目目录并安装核心包'));
        process.chdir(projectPath);
        
        // 3. 安装核心包
        console.log(chalk.hex('#4ECDC4')('  📦📦 安装核心包...'));
        execSync(`bun add koishi-plugin-yesimbot@file:${corePath} --dev --force`, { 
            stdio: 'inherit' 
        });
        console.log(chalk.green('✅ 核心包安装成功!'));
        
        // 4. 安装其他依赖
        console.log(chalk.hex('#4ECDC4').bold('\n🧩🧩 步骤 3/3: 安装项目依赖'));
        execSync('bun install', { stdio: 'inherit' });
        console.log(chalk.green('✅ 依赖安装成功!'));
        
        // 完成提示
        console.log(chalk.hex('#06D6A0').bold('\n🎉🎉 所有准备工作已完成!'));
        console.log(chalk.hex('#118AB2').bold('\n现在您可以开始开发:'));
        console.log(chalk.hex('#FFD166').bold(`  cd ${path.basename(projectPath)}`));
        console.log(chalk.hex('#FFD166').bold('  bun dev\n'));
        
        return true;
    } catch (buildError) {
        console.error(chalk.red('\n❌❌ 自动构建过程中出错:'));
        console.error(buildError);
        
        console.log(chalk.hex('#FF6B6B').bold('\n🛠🛠🛠️ 请尝试手动完成以下步骤:'));
        console.log(`  1. 进入项目目录: ${chalk.hex('#4ECDC4')(`cd ${path.basename(projectPath)}`)}`);
        console.log(`  2. 安装核心包: ${chalk.hex('#4ECDC4')(`bun add koishi-plugin-yesimbot@file:${path.join(os.homedir(), '.ybe-build/*/YesImBot-dev/packages/core')} --dev --force`)}`);
        console.log(`  3. 安装依赖: ${chalk.hex('#4ECDC4')('bun install')}`);
        console.log(`  4. 开始开发: ${chalk.hex('#4ECDC4')('bun dev')}\n`);
        
        return false;
    }
}

// 检查项目位置是否合适
function checkProjectLocation(projectPath) {
    const currentDir = path.dirname(projectPath);
    const parentDir = path.dirname(currentDir);
    
    // 检查是否在 YesImBot 的 packages/ 目录下
    const inYesImBotPackages = path.basename(parentDir) === 'packages' && 
                               fs.existsSync(path.join(parentDir, '../package.json'));
    
    // 检查是否在 Koishi 的 external/ 目录下
    const inKoishiExternal = path.basename(parentDir) === 'external' && 
                            (fs.existsSync(path.join(parentDir, '../koishi.yml')) || 
                             fs.existsSync(path.join(parentDir, '../koishi.yaml')));
    
    // 检查是否在项目根目录的 external/ 下
    const inRootExternal = path.basename(currentDir) === 'external' && 
                          (fs.existsSync(path.join(currentDir, '../koishi.yml')) || 
                           fs.existsSync(path.join(currentDir, '../koishi.yaml')));
    
    return {
        isValid: inYesImBotPackages || inKoishiExternal || inRootExternal,
        isYesImBotPackages: inYesImBotPackages
    };
}

// 主函数
async function main() {
    // 检查 Bun 是否安装
    const bunInstalled = await ensureBunInstalled();
    if (!bunInstalled) {
        console.log(chalk.red('❌❌ Bun 未安装，无法继续操作'));
        return;
    }
    
    const questions = [
        {
            type: 'input',
            name: 'extensionName',
            message: chalk.hex('#FFD166')('请输入扩展名称 (kebab-case 格式):'),
            validate: input => /^[a-z0-9-]+$/.test(input) || '名称必须使用 kebab-case 格式 (小写字母、数字、连字符)'
        },
        {
            type: 'input',
            name: 'friendlyName',
            message: chalk.hex('#FFD166')('请输入显示名称:'),
            default: answers => `${answers.extensionName.replace(/-/g, ' ')}`
        },
        {
            type: 'input',
            name: 'description',
            message: chalk.hex('#FFD166')('请输入扩展描述:')
        },
        {
            type: 'confirm',
            name: 'confirmCreate',
            message: chalk.hex('#FFD166')('确认使用以上设置创建扩展?'),
            default: true
        }
    ];
    
    const answers = await inquirer.prompt(questions);
    
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
        console.log(chalk.hex('#118AB2')(`\n📁📁 创建项目目录: ${projectName}`));
        
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
                pack: "bun pm pack",
                "install-core": `bun add koishi-plugin-yesimbot@file:${path.join(os.homedir(), '.ybe-build/*/YesImBot-dev/packages/core')} --dev --force`
            },
            keywords: [
                "koishi",
                "plugin",
                "extension",
                "yesimbot"
            ]
        });
        
        // 检查项目位置
        const locationInfo = checkProjectLocation(projectPath);
        
        console.log(chalk.green(`\n✅ 成功创建 "${answers.friendlyName}" 扩展!`));
        
        // 根据位置决定是否自动构建
        if (locationInfo.isYesImBotPackages) {
            console.log(chalk.hex('#06D6A0').bold('\n🌍🌍 检测到您在 YesImBot 项目内部创建扩展'));
            console.log(chalk.hex('#118AB2').bold('\n现在您可以开始开发:'));
            console.log(chalk.hex('#FFD166').bold(`  cd ${projectName}`));
            console.log(chalk.hex('#FFD166').bold('  bun install'));
            console.log(chalk.hex('#FFD166').bold('  bun dev\n'));
        } else {
            // 自动构建核心包并安装依赖
            const buildSuccess = await autoBuildCore(projectPath);
            
            if (!buildSuccess) {
                console.log(chalk.yellow('项目创建完成，但自动构建失败，请按照提示手动完成剩余步骤'));
            }
        }
        
        console.log(chalk.hex('#FF6B6B').bold('\n💡💡 其他建议:'));
        console.log('  1. 在 src/index.ts 中添加扩展逻辑');
        console.log('  2. 更新 README.md 中的使用说明');
        console.log('  3. 使用 bun add <package> 添加额外依赖\n');
        
    } catch (error) {
        console.error(chalk.red('\n创建扩展时出错:'), error);
        if (fs.existsSync(projectPath)) {
            fs.rmdirSync(projectPath, { recursive: true });
        }
    }
}

// 复制模板函数
async function copyTemplate(templateName, destPath) {
    const sourcePath = path.join(__dirname, '../templates', templateName);
    await fs.copy(sourcePath, destPath);
}

// 更新 package.json
async function updatePackageJson(packageJsonPath, updates) {
    let packageJson = await fs.readJson(packageJsonPath);
    
    // 处理版本号占位符
    if (packageJson.version === "{{version}}") {
        packageJson.version = "0.1.0";
    }
    
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

// 启动主程序
main().catch(err => {
    console.error(chalk.red('❌❌ 程序意外终止:'), err);
    process.exit(1);
});