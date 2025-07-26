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
import ora from 'ora';

// 正确获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

console.log(chalk.hex('#FF6B6B').bold(`
██╗   ██╗██████╗ ███████╗
╚██╗ ██╔╝██╔══██╗██╔════╝
 ╚████╔╝ ██████╔╝█████╗  
  ╚██╔╝  ██╔══██╗██╔══╝  
   ██║   ██████╔╝███████╗
   ╚═╝   ╚═════╝ ╚══════╝
                         
YesImBot 扩展脚手架工具 v1.1.1
`));

// 添加命令行执行函数
async function runCommand(command, options = {}) {
    const { cwd, hideOutput = true, context = "执行命令" } = options;
    const spinner = ora().start(chalk.hex('#4ECDC4')(`${context}: ${command}`));
    
    try {
        const result = await execAsync(command, { 
            stdio: hideOutput ? 'pipe' : 'inherit',
            cwd,
            env: {
                ...process.env,
                FORCE_COLOR: '1',
                NO_UPDATE_NOTIFIER: '1'
            }
        });
        
        spinner.succeed(chalk.green(`${context}成功!`));
        return result;
    } catch (error) {
        spinner.fail(chalk.red(`${context}失败!`));
        if (hideOutput && (error.stderr || error.stdout)) {
            console.error(chalk.red('错误详情:'));
            console.error(error.stderr || error.stdout);
        } else if (error.message) {
            console.error(chalk.red('错误信息:'), error.message);
        }
        throw error;
    }
}

// 检查包管理器是否安装
async function ensurePackageManagersInstalled() {
    let bunInstalled = false;
    let yarnInstalled = false;
    
    // 检查 Bun 是否安装
    try {
        await execAsync('bun --version');
        bunInstalled = true;
        console.log(chalk.green('✅ Bun 已安装'));
    } catch (error) {
        console.log(chalk.yellow('⚠️ 未检测到 Bun 包管理工具'));
    }
    
    // 检查 Yarn 是否安装
    try {
        await execAsync('yarn --version');
        yarnInstalled = true;
        console.log(chalk.green('✅ Yarn 已安装'));
    } catch (error) {
        console.log(chalk.yellow('⚠️ 未检测到 Yarn 包管理工具'));
    }
    
    // 如果两个包管理器都可用，让用户选择
    if (bunInstalled && yarnInstalled) {
        const answer = await inquirer.prompt([
            {
                type: 'list',
                name: 'packageManager',
                message: '请选择要使用的包管理器:',
                choices: [
                    { name: 'Bun (推荐)', value: 'bun' },
                    { name: 'Yarn', value: 'yarn' },                
                ],
                default: 'bun'
            }
        ]);
        return answer.packageManager;
    }
    
    // 如果只有Yarn可用
    if (yarnInstalled) return 'yarn';
    
    // 如果只有Bun可用
    if (bunInstalled) return 'bun';
    
    // 两个包管理器都不可用，询问是否安装Bun
    console.log(chalk.yellow('⚠️ 未检测到任何包管理工具'));
    const answer = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'installBun',
            message: '是否要自动安装 Bun (推荐)?',
            default: true
        }
    ]);
    
    if (!answer.installBun) {
        console.log(chalk.red('请手动安装 Yarn 或 Bun'));
        console.log('  Yarn: https://classic.yarnpkg.com/en/docs/install');
        console.log('  Bun: https://bun.sh');
        return null;
    }
    
    // 尝试安装Bun
    try {
        const spinner = ora().start(chalk.hex('#F7B801')('使用 npm 安装 Bun...'));
        await execAsync('npm install -g bun');
        spinner.succeed(chalk.green('✅ Bun 安装成功!'));
        return 'bun';
    } catch (npmError) {
        console.error(chalk.red('❌ Bun 安装失败:'), npmError);
        return null;
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
                console.log(chalk.hex('#4ECDC4')(`  🚚 下载进度: ${percent}% (${formatBytes(downloadedBytes)}/${formatBytes(totalBytes)})`));
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

// 自动构建核心包
async function autoBuildCore(projectPath, packageManager) {
    console.log(chalk.hex('#FF6B6B').bold('\n🌍 检测到您在外部开发，需要构建 YesImBot 核心包'));
    console.log(chalk.hex('#FFD166')('⏳ 这可能需要几分钟时间，请耐心等待...'));
    
    try {
        // 1. 构建核心包
        console.log(chalk.hex('#4ECDC4').bold('\n🚧 步骤 1/3: 构建 YesImBot 核心包'));
        const buildResult = await buildYesImBot(packageManager);
        console.log(chalk.green(`✅ 核心包构建成功! 位置: ${buildResult.corePath}, 版本: ${buildResult.version}`));
        
        // 2. 进入项目目录
        console.log(chalk.hex('#4ECDC4').bold('\n📂 步骤 2/3: 进入项目目录并安装核心包'));
        process.chdir(projectPath);
        
        // 3. 清理项目缓存
        cleanProjectCache(projectPath);
        
        // 4. 安装核心包 - 使用用户选择的包管理器
        let installCmd;
        if (packageManager === 'yarn') {
            installCmd = `yarn add koishi-plugin-yesimbot@file:${buildResult.corePath} --peer`;
        } else {
            installCmd = `bun add koishi-plugin-yesimbot@file:${buildResult.corePath} --peer --force`;
        }
        
        await runCommand(installCmd, { 
            hideOutput: true,
            context: "安装核心包"
        });
        console.log(chalk.green('✅ 核心包安装成功!'));
        
        // 5. 安装其他依赖
        console.log(chalk.hex('#4ECDC4').bold('\n🧩 步骤 3/3: 安装项目依赖'));
        
        let installDepsCmd;
        if (packageManager === 'yarn') {
            installDepsCmd = 'yarn install';
        } else {
            installDepsCmd = 'bun install';
        }
        
        await runCommand(installDepsCmd, { 
            hideOutput: true,
            context: "安装项目依赖"
        });
        console.log(chalk.green('✅ 依赖安装成功!'));
        
        // 完成提示
        let devCommand;
        if (packageManager === 'yarn') {
            devCommand = 'yarn dev';
        } else {
            devCommand = 'bun dev';
        }
        
        console.log(chalk.hex('#06D6A0').bold('\n🎉 所有准备工作已完成!'));
        console.log(chalk.hex('#118AB2').bold('\n现在您可以开始开发:'));
        console.log(chalk.hex('#FFD166').bold(`  cd ${path.basename(projectPath)}`));
        console.log(chalk.hex('#FFD166').bold(`  ${devCommand}\n`));
        
        return true;
    } catch (buildError) {
        console.error(chalk.red('\n❌❌ 自动构建过程中出错:'));
        console.error(buildError);
        
        // 定义 devCommand 用于错误提示
        const devCommand = packageManager === 'yarn' ? 'yarn dev' : 'bun dev';
        
        console.log(chalk.hex('#FF6B6B').bold('\n🛠️ 请尝试手动完成以下步骤:'));
        console.log(`  1. 进入项目目录: ${chalk.hex('#4ECDC4')(`cd ${path.basename(projectPath)}`)}`);
        console.log(`  2. 清理缓存: ${chalk.hex('#4ECDC4')('rm -rf node_modules')} ${packageManager === 'yarn' ? 'yarn.lock' : 'bun.lockb'}`);
        
        let manualInstallCmd;
        if (packageManager === 'yarn') {
            manualInstallCmd = `yarn add koishi-plugin-yesimbot@file:${path.join(os.homedir(), '.ybe-build/*/YesImBot-dev/packages/core')} --dev`;
        } else {
            manualInstallCmd = `bun add koishi-plugin-yesimbot@file:${path.join(os.homedir(), '.ybe-build/*/YesImBot-dev/packages/core')} --dev --force`;
        }
        
        console.log(`  3. 安装核心包: ${chalk.hex('#4ECDC4')(manualInstallCmd)}`);
        
        let manualDepsCmd;
        if (packageManager === 'yarn') {
            manualDepsCmd = 'yarn install';
        } else {
            manualDepsCmd = 'bun install';
        }
        
        console.log(`  4. 安装依赖: ${chalk.hex('#4ECDC4')(manualDepsCmd)}`);
        console.log(`  5. 开始开发: ${chalk.hex('#4ECDC4')(devCommand)}\n`);
        
        return false;
    }
}

function isKoishiProject(cwd) {
  return fs.existsSync(path.join(cwd, 'koishi.yml')) || 
         fs.existsSync(path.join(cwd, 'koishi.yaml')) ||
         fs.existsSync(path.join(cwd, 'node_modules/koishi'));
}

async function getUpdatePackages() {
  const { packages } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'packages',
      message: '选择要更新的包:',
      choices: [
        { name: '核心包 (koishi-plugin-yesimbot)', value: 'core' },
        { name: '代码执行器扩展', value: 'code-interpreter' },
        { name: '代码转图片扩展', value: 'code2image' },
        { name: '好感度扩展', value: 'favor' },
        { name: 'MCP 扩展', value: 'mcp' },
        { name: '表情包管理扩展', value: 'sticker-manager' },
        { name: '所有扩展包', value: 'all-extensions' }
      ]
    }
  ]);
  return packages;
}

async function installPackage(pkg, buildResult, packageManager) {
  let packagePath, packageName;
  
  if (pkg === 'core') {
    packagePath = buildResult.corePath;
    packageName = 'koishi-plugin-yesimbot';
  } else if (pkg === 'all-extensions') {
    // 安装所有扩展
    const extensions = ['code-interpreter', 'code2image', 'favor', 'mcp', 'sticker-manager'];
    for (const ext of extensions) {
      await installPackage(ext, buildResult, packageManager);
    }
    return;
  } else {
    packagePath = path.join(buildResult.projectPath, 'packages', pkg);
    packageName = `koishi-plugin-yesimbot-extension-${pkg}`;
  }

  const installCmd = packageManager === 'yarn' 
    ? `yarn add ${packageName}@file:${packagePath}` 
    : `bun add ${packageName}@file:${packagePath} --force`;
  
  await runCommand(installCmd, { 
    context: `安装 ${packageName}`
  });
}


// 清理项目缓存
function cleanProjectCache(projectPath) {
    console.log(chalk.hex('#4ECDC4')('🧹 清理项目缓存...'));
    
    const pathsToClean = [
        path.join(projectPath, 'node_modules'),
        path.join(projectPath, 'bun.lockb'),
        path.join(projectPath, 'package-lock.json'),
        path.join(projectPath, 'yarn.lock')
    ];
    
    pathsToClean.forEach(item => {
        try {
            if (fs.existsSync(item)) {
                fs.removeSync(item);
                console.log(chalk.hex('#4ECDC4')(`  ✅ 已删除: ${path.basename(item)}`));
            }
        } catch (error) {
            console.log(chalk.yellow(`  ⚠️ 清理失败: ${path.basename(item)}`));
        }
    });
}

// 移除所有package.json中的packageManager字段
function removePackageManagerFields(projectPath) {
    console.log(chalk.hex('#FF6B6B')('🔧 移除所有package.json中的packageManager字段...'));
    
    try {
        // 查找所有package.json文件
        const packageJsonFiles = findFiles(projectPath, 'package.json');
        
        packageJsonFiles.forEach(file => {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const packageJson = JSON.parse(content);
                
                if (packageJson.packageManager) {
                    delete packageJson.packageManager;
                    fs.writeFileSync(file, JSON.stringify(packageJson, null, 2));
                    console.log(chalk.hex('#4ECDC4')(`  ✅ 已移除: ${path.relative(projectPath, file)}`));
                }
            } catch (error) {
                console.log(chalk.yellow(`  ⚠️ 处理失败: ${path.relative(projectPath, file)}`));
            }
        });
        
        return true;
    } catch (error) {
        console.log(chalk.yellow('⚠️ 移除packageManager字段失败:'), error.message);
        return false;
    }
}

// 添加 packageManager 字段以避免 Turbo 警告
async function addPackageManagerField(projectPath, packageManager) {
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        if (!packageJson.packageManager) {
            let version;
            if (packageManager === 'yarn') {
                const { stdout } = await execAsync('yarn --version');
                version = stdout.trim();
                packageJson.packageManager = `yarn@1.22.22`;
            } else {
                const { stdout } = await execAsync('bun --version');
                version = stdout.trim();
                packageJson.packageManager = `bun@${version}`;
            }
            
            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
            console.log(chalk.hex('#4ECDC4')(`  ✅ 添加 packageManager 字段: ${packageJson.packageManager}`));
        }
    } catch (error) {
        console.log(chalk.yellow('  ⚠️ 添加 packageManager 字段失败:'), error.message);
    }
}

// 递归查找文件
function findFiles(dir, fileName) {
    let results = [];
    const list = fs.readdirSync(dir);
    
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        
        if (stat && stat.isDirectory()) {
            // 递归查找
            results = results.concat(findFiles(file, fileName));
        } else {
            if (path.basename(file) === fileName) {
                results.push(file);
            }
        }
    });
    
    return results;
}

// 构建核心包
async function buildYesImBot(packageManager) {
    console.log(chalk.hex('#FF6B6B').bold('\n🔧🔧 开始构建 YesImBot 核心包...'));
    
    // 创建专用构建目录
    const tempDir = path.join(os.homedir(), '.ybe-build', Date.now().toString());
    const zipPath = path.join(tempDir, 'YesImBot-dev.zip');
    let repoUrl = '';
    
    try {
        // 确保使用全新的临时目录
        fs.mkdirSync(tempDir, { recursive: true });
        
        // 下载最新 dev 分支
        console.log(chalk.hex('#4ECDC4')('⬇ ️正在下载 YesImBot dev 分支...'));
        
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
        console.log(chalk.hex('#4ECDC4')('📦 正在解压文件...'));
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
        console.log(chalk.hex('#FF6B6B').bold('\n🔨 安装依赖并构建核心包...'));
        
        // 确保包管理器已安装
        if (!packageManager) {
            throw new Error('没有可用的包管理器，无法继续构建');
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
        
        // 处理Corepack问题 - 直接移除所有package.json中的packageManager字段
        if (packageManager === 'yarn') {
            removePackageManagerFields(projectPath);
        }
        
        // 安装依赖
        console.log(chalk.hex('#4ECDC4')('🧩 安装依赖...'));
        if (packageManager === 'yarn') {
            await runCommand('yarn install --ignore-engines', { 
                cwd: projectPath,
                hideOutput: true,
                context: "安装项目依赖"
            });
        } else {
            await runCommand('bun install --ignore-engines', { 
                cwd: projectPath,
                hideOutput: true,
                context: "安装项目依赖"
            });
        }
        
        // 添加 packageManager 字段以避免 Turbo 警告
        await addPackageManagerField(projectPath, packageManager);
        
        // 构建核心包
        console.log(chalk.hex('#4ECDC4')('🔨 构建核心包...'));
        if (packageManager === 'yarn') {
            await runCommand('yarn build', { 
                cwd: projectPath,
                hideOutput: true,
                context: "构建核心包"
            });
        } else {
            await runCommand('bun run build', { 
                cwd: projectPath,
                hideOutput: true,
                context: "构建核心包"
            });
        }
        
        // 读取核心包版本
        const corePackageJsonPath = path.join(projectPath, 'packages/core/package.json');
        const corePackage = JSON.parse(fs.readFileSync(corePackageJsonPath, 'utf-8'));
        console.log(chalk.green(`✅ 核心包版本: ${corePackage.version}`));
        
        // 返回核心包路径
        return {
            corePath: path.join(projectPath, 'packages/core'),
            projectPath: projectPath,
            version: corePackage.version
        };
    } catch (error) {
        console.error(chalk.red('\n❌❌ 构建过程中出错:'));
        console.error(error);
        
        // 提供用户可操作的解决方案
        console.log(chalk.hex('#FF6B6B').bold('\n🛠️ 可能的解决方案:'));
        console.log('1. 检查网络连接');
        console.log('2. 尝试设置镜像: export YBE_MIRROR=https://github.akams.cn');
        console.log('3. 手动下载源码:');
        console.log(chalk.hex('#4ECDC4')(`   curl -L ${repoUrl} -o ${zipPath}`));
        console.log('4. 手动构建:');
        console.log(chalk.hex('#4ECDC4')(`   unzip ${zipPath} -d ${tempDir}`));
        console.log(chalk.hex('#4ECDC4')(`   cd ${tempDir}/YesImBot-dev`));
        console.log(chalk.hex('#4ECDC4')(`   ${packageManager || 'yarn'} install --ignore-engines && ${packageManager || 'yarn'} run build`));
        
        throw error;
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

async function updateCommand() {
  // 检查包管理器
  const packageManager = await ensurePackageManagersInstalled();
  if (!packageManager) {
    console.log(chalk.red('❌ 没有可用的包管理器，无法继续操作'));
    return;
  }

  // 检查当前目录是否是 Koishi 项目
  if (!isKoishiProject(process.cwd())) {
    console.log(chalk.red('❌ 当前目录不是 Koishi 项目！请在 Koishi 项目根目录运行此命令'));
    return;
  }

  // 获取要更新的包列表
  const packagesToUpdate = await getUpdatePackages();
  if (packagesToUpdate.length === 0) {
    console.log(chalk.yellow('⚠️ 未选择任何包，操作取消'));
    return;
  }

  // 构建 YesImBot 项目
  console.log(chalk.hex('#FF6B6B').bold('\n🔧 开始构建 YesImBot 项目...'));
  let buildResult;
  try {
    buildResult = await buildYesImBot(packageManager);
    console.log(chalk.green(`✅ YesImBot 构建成功! 版本: ${buildResult.version}`));
  } catch (error) {
    console.error(chalk.red('\n❌ YesImBot 构建失败:'), error);
    return;
  }

  // 安装选定的包
  for (const pkg of packagesToUpdate) {
    try {
      await installPackage(pkg, buildResult, packageManager);
      console.log(chalk.green(`✅ ${pkg} 安装成功!`));
    } catch (error) {
      console.error(chalk.red(`❌ 安装 ${pkg} 失败: `), error.message);
    }
  }

  console.log(chalk.hex('#06D6A0').bold('\n🎉 更新完成!'));
  console.log(chalk.hex('#118AB2')('请重启 Koishi 服务使更改生效\n'));
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  try {
    if (command === 'create') {
      // 原有创建扩展逻辑
      await createCommand();
    } else if (command === 'update') {
      await updateCommand();
    } else {
      // 显示帮助信息
      console.log(chalk.hex('#FF6B6B').bold('\nYesImBot 扩展工具 v1.2.0'));
      console.log(chalk.hex('#4ECDC4')('可用命令:'));
      console.log('  create - 创建新扩展');
      console.log('  update - 更新/安装 YesImBot 包\n');
      console.log(chalk.hex('#118AB2')('示例:'));
      console.log('  ybe create     创建新扩展');
      console.log('  ybe update     更新 YesImBot 包');
      console.log('  ybe            显示帮助信息\n');
    }
  } catch (error) {
    console.error(chalk.red('❌ 操作失败:'), error.message);
    process.exit(1);
  }
}

async function createCommand() {
  // 这是原有 main 函数中创建扩展的逻辑
  // 需要将原来 main 函数中创建扩展的代码剪切到这里
  
  // 检查包管理器是否安装
  const packageManager = await ensurePackageManagersInstalled();
  if (!packageManager) {
    console.log(chalk.red('❌❌❌❌ 没有可用的包管理器，无法继续操作'));
    return;
  }
  
     // 如果使用的是Yarn，提示用户
    if (packageManager === 'yarn') {
        console.log(chalk.hex('#4ECDC4').bold('🎯 将使用 Yarn 作为包管理器'));
    } else {
        console.log(chalk.hex('#4ECDC4').bold('🎯 将使用 Bun 作为包管理器'));
    }
    
    const questions = [
        {
            type: 'input',
            name: 'extensionName',
            message: chalk.hex('#FFD166')('请输入扩展名称 (kebab-case 格式:'),
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
        console.log(chalk.hex('#118AB2')(`\n📁 创建项目目录: ${projectName}`));
        
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
                pack: packageManager === 'yarn' ? "yarn pack" : "bun pm pack",
                "install-core": packageManager === 'yarn' ? 
                    `yarn add koishi-plugin-yesimbot@file:${path.join(os.homedir(), '.ybe-build/*/YesImBot-dev/packages/core')} --dev` :
                    `bun add koishi-plugin-yesimbot@file:${path.join(os.homedir(), '.ybe-build/*/YesImBot-dev/packages/core')} --dev --force`
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
            console.log(chalk.hex('#06D6A0').bold('\n🌍 检测到您在 YesImBot 项目内部创建扩展'));
            console.log(chalk.hex('#118AB2').bold('\n现在您可以开始开发:'));
            console.log(chalk.hex('#FFD166').bold(`  cd ${projectName}`));
            console.log(chalk.hex('#FFD166').bold(`  ${packageManager} install`));
            console.log(chalk.hex('#FFD166').bold(`  ${packageManager} dev\n`));
        } else {
            // 自动构建核心包并安装依赖（传入包管理器类型）
            const buildSuccess = await autoBuildCore(projectPath, packageManager);
            
            if (!buildSuccess) {
                console.log(chalk.yellow('项目创建完成，但自动构建失败，请按照提示手动完成剩余步骤'));
            }
        }
        
        console.log(chalk.hex('#FF6B6B').bold('\n💡 其他建议:'));
        console.log('  1. 在 src/index.ts 中添加扩展逻辑');
        console.log('  2. 更新 README.md 中的使用说明');
        console.log(`  3. 使用 ${packageManager === 'yarn' ? 'yarn add' : 'bun add'} <package> 添加额外依赖\n`);
        
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
