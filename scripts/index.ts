// tslint:disable:no-implicit-dependencies
import * as childProcess from 'child_process';
import * as colors from 'colors';
import * as cpx from 'cpx';
import * as fs from 'fs';
import * as minimist from 'minimist';
import * as mkdirp from 'mkdirp';
import * as path from 'path';
import * as rimraf from 'rimraf';

interface IPackage {
  name: string;
  path: string;
}

const defaultPackageDir = 'packages';
const defaultPackageDistDir = 'dist';
const nodeModulesDir = 'node_modules';
const packageJson = 'package.json';
const exec = childProcess.exec;
const cwd = process.cwd();
const isWin = process.platform.includes('win32');

const argv = minimist(process.argv.slice(2));

// TODO -args here
const packageDir: string = argv.p || argv.packages || defaultPackageDir;
const packageDistDir: string = argv.d || argv.dist || defaultPackageDistDir;

if (typeof packageDir !== 'string' || typeof packageDistDir !== 'string') {
  console.error(colors.red(`Cannot parse command params packages: ${packageDir} dist dir: ${packageDistDir}`));
  process.exit(1);
}

const execCmd = async (cmd: string) => new Promise((res, rej) => {
  console.info(colors.yellow(`executing ${cmd}`));
  const stream = exec(cmd);

  stream.stdout.on('data', (chunk) => console.info(colors.green(chunk.toString())));

  stream.stderr.on('data', (chunk) => console.error(colors.red(chunk.toString())));

  stream.on('error', (err) => {
    return err
      ? rej(err)
      : res(err);
  });

  stream.on('exit', (code) => {
    return code === 0
      ? res()
      : rej();
  });
});

const readPath = async (p: string) => new Promise<string[]>((res, rej) =>
  fs.readdir(p, (err, paths) => err ? rej(err) : res(paths)));

const removePath = async (p: string) => new Promise<void>((res, rej) =>
  rimraf(p, (err) => err ? rej(err) : res()));

const copyPath = async (p: string, destPath: string) => new Promise((res, rej) =>
  cpx.copy(p, destPath, (err) => err ? rej(err) : res()));

const createPath = async (p: string) => new Promise((res, rej) =>
  mkdirp(p, (err, mode) => err ? rej(err) : res(mode)));

const symLinkPath = async (p: string, destPath: string) => {
  return isWin
    ? execCmd(`mklink /J "${destPath}" "${p}"`)
    : execCmd(`ln -s ${p} ${destPath}`);
};

const pathExists = async (p: string) => new Promise((res, rej) =>
  fs.exists(p, (exist) => exist ? res() : rej()));

const pathIsSymLink = async (p: string) => new Promise((res, rej) =>
  fs.lstat(p, (err, stat) => !err && stat.isSymbolicLink() ? res() : rej()));

const linkDist = async (pckg: IPackage) => {
  const modulesPackagePath = path.join(cwd, nodeModulesDir, pckg.name);
  const packageDistPath = path.join(pckg.path, packageDistDir);
  try {
    await pathExists(modulesPackagePath);
    console.info(colors.green(`${modulesPackagePath} exists`));
    try {
      await pathIsSymLink(modulesPackagePath);
      console.info(colors.green(`${modulesPackagePath} is a symbolic link`));
    } catch {
      console.info(colors.magenta(`${modulesPackagePath} is not a symbolic link`));
      await removePath(packageDistPath);
      await copyPath(modulesPackagePath, packageDistPath);
      await removePath(modulesPackagePath);
      await symLinkPath(packageDistPath, modulesPackagePath);
    }
  } catch {
    console.info(colors.magenta(`${modulesPackagePath} does not exist`));
    try {
      await pathExists(packageDistPath);
      console.info(colors.green(`${packageDistPath} exists`));
      await symLinkPath(packageDistPath, modulesPackagePath);
    } catch {
      console.info(colors.magenta(`${packageDistPath} does not exist: create it`));
      await createPath(packageDistPath);
      await symLinkPath(packageDistPath, modulesPackagePath);
    }
  }
};

const linkModules = async (pckg: IPackage) => {
  const packageModulesPath = path.join(pckg.path, nodeModulesDir);
  const modulesPath = path.join(cwd, nodeModulesDir);
  try {
    await pathExists(packageModulesPath);
    console.info(colors.green(`${packageModulesPath} exists`));
    try {
      await pathIsSymLink(packageModulesPath);
      console.info(colors.green(`${packageModulesPath} is a symbolic link`));
    } catch {
      console.info(colors.magenta(`${packageModulesPath} is not a symbolic link`));
      await removePath(packageModulesPath);
      await symLinkPath(modulesPath, packageModulesPath);
    }
  } catch {
    console.info(colors.magenta(`${packageModulesPath} does not exist`));
    await symLinkPath(modulesPath, packageModulesPath);
  }
};

const main = async () => {
  try {
    const packagesPath = path.join(cwd, packageDir);
    const packages = (await readPath(packagesPath))
      .map((name) => ({
        name: require(path.join(packagesPath, name, packageJson)).name,
        path: path.join(packagesPath, name),
      }));
    packages.forEach((pckg) => {
      linkDist(pckg);
      linkModules(pckg);
    });
  } catch (e) {
    console.error(colors.red(`Error : ${e.message}`));
    process.exit(1);
  }
};

main();
