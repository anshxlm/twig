#!/usr/bin/env node
import yargs from 'yargs';
import express from 'express';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import ora from 'ora';
import envPaths from 'env-paths';
import { input, password, confirm } from '@inquirer/prompts';
import fs, { existsSync, read } from 'node:fs';
import { randomUUID } from 'node:crypto'
import path from "path";
import { fileURLToPath } from 'url';
import { get } from 'node:https';
import { exec } from 'child_process';
import { Octokit } from "@octokit/core";
import os from "os";
/* -------------------------------------------------------    CUSTOM IMPORTS   --------------------------------------------------------------------*/

import { Logger } from '../lib/process/logger.js';
import * as database from '../lib/process/database.js'
import * as crypto from '../lib/process/crypto.js'
import initialize from '../lib/engine/initialize.js';
import commit from '../lib/engine/commit.js';
import getDirectoryFiles from '../lib/util/getDirectoryFiles.js';
import filesIntoDB from '../lib/util/filesIntoDb.js';
import getTreeFilesAndHash from '../lib/util/getTreeFilesAndHash.js';
import compare from '../lib/engine/compare.js';
import comparison from '../lib/util/comparison.js';
import twigLog from '../lib/engine/log.js';

/* ---------------------------------------------------------- GLOBAL / SETUP --------------------------------------------------------------*/

process.env.UV_THREADPOOL_SIZE = String(Math.max(16, os.cpus().length));
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = new Logger()
const paths = envPaths('twigvcs', {suffix:''});
async function promptToken(){
    const token = await password({message:'paste your token'})
    fs.writeFileSync(path.join(paths.data, 'GITHUB_TOKEN'), token);
    console.log(chalk.green('Token saved.'))
}
let GITHUB_SECRET
try {
GITHUB_SECRET = fs.readFileSync(path.join(paths.data, 'GITHUB_TOKEN' ), 'utf8')
} catch (error){
if (error.code == "ENOENT")
  promptToken()
}

/* ----------------------------------------------------------     ENGINE     --------------------------------------------------------------*/

// console logs the tree layout of a tree (deprecated)
function consoleFileTree(treeHash, indent = "") {

    const treeIn = JSON.parse(database.getObjectLike(treeHash).data);

    for (let i = 0; i < treeIn.length; i++) {

        const last = i === treeIn.length - 1;

        console.log(indent +(last ? "└──" : "├──") +treeIn[i].name);

        if (treeIn[i].type === "tree") {
            consoleFileTree(treeIn[i].hash,indent + "│   ");
        }
    }
}

// returns the tree contents
function treeContents(treeHash, indent = "",) {
  const guiArray = []

    const treeIn = JSON.parse(database.getObject(treeHash).data);

    for (let i = 0; i < treeIn.length; i++) {

        const last = i === treeIn.length - 1;

        guiArray.push(treeIn[i]);
    }
  
    return guiArray
}

// get the commit history of a branch provided a branches latest commit
function getBranchCommitHistory(branch_hash){  
  let hash = branch_hash

   const historyArr = []; 

  while (hash) {

    const commit = JSON.parse(database.getObject(hash).data);

    historyArr.push({hash:hash, message:commit.message, tree:commit.tree})

    hash = commit.parent;
} 

  return historyArr

}

// only return commits of a branch that have not been pushed to github
function getUnpushedCommitHistory(branch_hash){  

  let hash = branch_hash
  const hasPushed = database.getObject(branch_hash).commit_sha

   const historyArr = []; 

if (!hasPushed){

  while (hash) {

    const commit = JSON.parse(database.getObject(hash).data);
    const pushed = database.getObject(hash).commit_sha

    if (!pushed){
    historyArr.push({hash:hash, message:commit.message, tree:commit.tree})
    hash = commit.parent;
    }
  else {
    break
  }

} 
}

  return historyArr.toReversed()

}

// returns ONLY files of a tree, along with file name and hash ***********************************************************
function getTreeFiles(branch, currPath="/", allFiles = []) {
    const treeIn = JSON.parse(database.getObject(branch).data);

    for (const subtree of treeIn) {

        if (subtree.type == "tree") {
            getTreeFiles(subtree.hash, currPath + subtree.name + '/', allFiles);
        } else {
          allFiles.push([currPath, subtree.name, subtree.hash]);
        }
    }

    return allFiles
}

// checks if a commit is a descendant of another.
function ancestry(ancestor, descendant){

  let currentHash = descendant
  while (currentHash){
      if (currentHash == database.getObject(ancestor).hash){
          return true
        }
        const commit = JSON.parse(database.getObject(currentHash).data);
        currentHash = commit.parent;
      }
    return false

}

// part of merging algorithm - finds a common commit
function findCommonBase(currCommit, branchCommit){
  let curr = currCommit
  const visited = new Set();

    while (curr) {
        visited.add(curr);
        curr = JSON.parse(database.getObject(curr).data).parent
    }

    let branchCurr = branchCommit

    while (branchCurr) {
        if (visited.has(branchCurr)){
            return branchCurr;
        } else {

        branchCurr = JSON.parse(database.getObject(branchCurr).data).parent
        }
    }

    return null;

}

// merge algorithm - which file/hash to use on case by case basis of changes. also throws conflict
function classify(baseHash, currHash, mergeHash) {

    if (baseHash === currHash && baseHash === mergeHash) {
        return {
            type: "UNCHANGED",
            hash: baseHash
        };
    }

    if (baseHash === currHash) {
        return {
            type: "USE_MERGE",
            hash: mergeHash
        };
    }

    if (baseHash === mergeHash) {
        return {
            type: "USE_CURRENT",
            hash: currHash
        };
    }

    if (currHash === mergeHash) {
        return {
            type: "SAME_CHANGE",
            hash: currHash
        };
    }

    return {
        type: "CONFLICT",
        currHash: currHash,
        mergeHash: mergeHash

    };
}

// part of merging - putting trees into db *****************************************************
function writeMergeTree(node) {

    const entries = [];

    for (const [name, dir] of Object.entries(node.directories)) {

        const treeHash = writeMergeTree(dir);

        entries.push({
            name,
            type: "tree",
            hash: treeHash
        });
    }

    for (const [name, hash] of Object.entries(node.files)) {

        entries.push({
            name,
            type: "blob",
            hash
        });
    }

    const treeHash = crypto.hash(JSON.stringify(entries));
try {

    database.insertObject(
        treeHash,
        "tree",
        JSON.stringify(entries)
    );
  } catch (err) {
    if (err.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY'){
      throw err
    }
  }

    return treeHash;
}

// provide a commits tree and it will recreate the filesystem at that commit WARNING FATAL
function loadCommitToDirectory(treeIn){
   const folderPath = './';
   const initalfiles = fs.readdirSync(folderPath)
  const files = initalfiles.filter(item => item.startsWith('.twig') !== true)

for (const file of files) {
  const curPath = path.join(folderPath, file);
  try {
    fs.rmSync(curPath, { recursive: true, force: true });
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EBUSY') {
      if (fs.statSync(curPath).isFile()) {
        fs.writeFileSync(curPath, '');
      }
    } {
      console.error(err.message);
    }
  }
}
      const filesToMake = getTreeFiles(treeIn)

      for (const file of filesToMake){
      const content = fs.readFileSync('./.twig/files/' + file[2], 'utf8');
      fs.mkdirSync('./' + file[0], { recursive: true }, (err) => {
        logger.error("engine", err)
      });
      fs.writeFileSync('./' + file[0] + file[1], content, 'utf8');

      }


}

// sends blobs to github for SHA but ONLY for the first commit of the first push. throttling set to 25
async function uploadFirstTree(treeHash, path = "", files = [], spinner) {
  const octokit = new Octokit({ auth: GITHUB_SECRET });
  const OWNER = "anshxlm";
  const REPO = "twigtesting";

  spinner.text = "Building trees...";

  function gather(hash, currentPath) {
    const treeIn = JSON.parse(database.getObject(hash).data);

    for (const subtree of treeIn) {
      if (subtree.type === "tree") {
        gather(subtree.hash, currentPath + subtree.name + "/");
      } else {
        files.push({
          path: currentPath + subtree.name,
          localHash: subtree.hash,
          type: "blob",
          mode: "100644"
        });
      }
    }
  }

  gather(treeHash, path);

  const CONCURRENCY_LIMIT = 25;
  for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {

    spinner.text = `Github processing ${i} files`;

    const chunk = files.slice(i, i + CONCURRENCY_LIMIT);

    await Promise.all(
      chunk.map(async (file) => {
        const { data: blobData } = await octokit.request("POST /repos/{owner}/{repo}/git/blobs", {
          owner: OWNER,
          repo: REPO,
          content: fs.readFileSync('./.twig/files/' + file.localHash, 'utf8'),
          encoding: "utf-8"
        });
        
        file.sha = blobData.sha;
      })
    );
  }

  return files;
}

// only sends changed blobs to github. throttling set to 25
async function deltaUpload(tree1, tree2, spinner) {
  const octokit = new Octokit({ auth: GITHUB_SECRET });
  const OWNER = "anshxlm";
  const REPO = "twigtesting";

  const allFiles = new Set([...Object.keys(tree1), ...Object.keys(tree2)]);
  
  const finalDeltas = [];
  const toUpload = [];

  for (const file of allFiles) {
    spinner.text = `Github processing ${allFiles.length}`;
    if (!(file in tree1)) {
      const item = {
        path: file,
        localHash: tree2[file],
        type: "blob",
        mode: "100644"
      };
      finalDeltas.push(item);
      toUpload.push(item);
    } else if (!(file in tree2)) {
      finalDeltas.push({
        path: file,
        type: "blob",
        mode: "100644",
        sha: null
      });
    } else if (tree1[file] !== tree2[file]) {
      const item = {
        path: file,
        localHash: tree2[file],
        type: "blob",
        mode: "100644"
      };
      finalDeltas.push(item);
      toUpload.push(item);
    }
  }
  const CONCURRENCY_LIMIT = 25;
  for (let i = 0; i < toUpload.length; i += CONCURRENCY_LIMIT) {
    spinner.text = `Github processing ${i} files`;
    const chunk = toUpload.slice(i, i + CONCURRENCY_LIMIT);

    await Promise.all(
      chunk.map(async (item) => {
        const { data: blobData } = await octokit.request("POST /repos/{owner}/{repo}/git/blobs", {
          owner: OWNER,
          repo: REPO,
          content: fs.readFileSync('./.twig/files/' + item.localHash, 'utf8'),
          encoding: "utf-8"
        });
        
        item.sha = blobData.sha;
      })
    );
  }

  return finalDeltas;
}


function uncommittedChanges(treeIn){
  logger.log("engine", "checking for uncommitted changes")
  const currHead = fs.readFileSync('./.twig/HEAD', 'utf8');
      let curr_branch_commit
      if (database.getBranch(currHead) !== undefined){
      curr_branch_commit = database.getBranch(currHead).commit_hash
      } else {
        curr_branch_commit = currHead
      }
      const cur_treeIn = (JSON.parse(database.getObject(curr_branch_commit).data).tree)

      const curr_files = getTreeFiles(cur_treeIn)

      const currRead = getDirectoryFiles('./')
      const remote_comparison_files = []
      const local_comparison_files = []
      for (const file of curr_files){
        remote_comparison_files.push([path.join(file[0].slice(1, file[0].length), file[1]), file[2]])
      }

      for (const file of currRead){
        local_comparison_files.push([file, crypto.hash(fs.readFileSync(file, 'utf8'))])
      }

      if (JSON.stringify(remote_comparison_files.sort()) !== JSON.stringify(local_comparison_files.sort())){
        return true
      } else {
        return false
      }
}

/* ---------------------------------------------------------- CLIENT --------------------------------------------------------------*/



const cli = yargs(hideBin(process.argv))
  .scriptName('twig')
  .parserConfiguration({
    'short-option-groups': false,
    'camel-case-expansion': false, 
  })
  .usage('Usage: $0 <command> [options]'
  ).command(
    'init',
    'Initialize Twig in a working directory',
    (yargs) => {},
    async (argv) => {  
      await initialize()
     }
  ).command(
    'commit',
    'Commit changes',
    (yargs) => {
      return yargs.option('m', {
        alias: 'message',
        describe: 'The message for your commit - if not provided, falls back to a prompt'
      })
    },
    async (argv) => {

      let msg
      if (!argv.m){
           try {
                     msg = await input({ message: 'what is your commit message? (CTRL C to cancel)', required:true,  validate: (value) => {
                        if (value && value.toString().trim() !== '' && value !== '0' && value !== 'false') {
                            return true;
                    }
                        return 'Please provide a input';
                    }});
                    } catch (error){
                        if (error.name == "ExitPromptError"){
                            logger.log("client", "commit cancelled")
                            process.exit(0)
                        } else {
                            throw error
                    }
                    }
      }

      await commit(msg)

    }
  ).command(
    'compare <c1> <c2>', 
    'Compare what changed between two commit ID\'s. Order does not matter', 
    (yargs) => {
      return yargs.positional('c1', {
        describe: 'Commit 1 to compare',
        type: 'string',
      }).positional('c2', {
        describe: 'Commit 2 to compare',
        type: 'string',
      })
    }, 
    (argv) => {
      
      compare(argv.c1, argv.c2)
      
    }
  ).command(
    'log', 
    'Display commit history for your current branch', 
    () => {}, 
    (argv) => {

      const parentBranch = fs.readFileSync('./.twig/HEAD', 'utf8');
      let hash;
      if (database.getBranch(parentBranch) !== undefined){
       hash = database.getBranch(parentBranch).commit_hash
      } else {
        hash = parentBranch
      }
    
      twigLog(hash)
      


    }
  ).command(
    'branch <name> [options]', 
    'Create or delete a branch', 
    (yargs) => {
      return yargs.positional('name', {
        describe: 'name of branch',
        type: 'string',
        demandOption:false
      }).option('rm', {
        alias: 'remove',
        describe: `delete the inputted branch. add ${chalk.bold('all')} to remove all branches except master.`
      })
    }, 
    async (argv) => {
    
    if (argv.rm){
      if (argv.rm == "all"){
        const branches = database.getAllBranches()

        for (const branch of branches){
          if (branch.name !== "master"){
            database.deleteBranch(branch.name)
          }
        }

      } else {
      const confirmation = await confirm({message:`are you sure you want to delete branch ${chalk.magenta.bold(argv.name)}?`})
      if (confirmation){
        database.deleteBranch(argv.name)
        logger.success('client', "branch deleted")
      }
    }

    } else {
      
      const parentBranch = fs.readFileSync('./.twig/HEAD', 'utf8');
      let undoDeletion = false;
try {
    database.newBranch(argv.name, database.getBranch(parentBranch).commit_hash)
} catch (error){
  if (error.message == "UNIQUE constraint failed: branches.name"){
    if (database.getBranch(argv.name, true).deleted){
      undoDeletion = true
    } else {
      logger.error('engine', "branch already exists")
      process.exit()
    }
  } else throw error
}
    if (undoDeletion){
      database.undoDeleteBranch(argv.name)
      database.setParentBranch(database.getBranch(parentBranch).commit_hash, argv.name)
    }

    logger.success("client", `new branch ${chalk.magenta.bold(argv.name)} created`)
    const checkout = await confirm({message:`would you like to checkout ${chalk.magenta.bold(argv.name)}?`, default:false})
    if (checkout){
      if (!uncommittedChanges()){
      fs.writeFileSync('./.twig/HEAD',argv.name, 'utf8');
      logger.success("client", "Current HEAD: Branch " + chalk.magenta.bold(argv.name))
      } else {
         logger.error("engine", "failed to checkout new branch because there are uncomitted changes in your current working directory.")
      }
    }

      }
    }
  ).command(
    'checkout <name>', 
    'Checkout a branch or commit', 
    (yargs) => {
      return yargs.positional('name', {
        describe: 'name of branch / commit ID',
        type: 'string',
      }).option('b', {
        alias: 'branch',
        describe: 'Name option to create a new branch with checked out commit'
      })
    }, 
    (argv) => {

    if (database.getBranch(argv.name) == undefined){
      const commit = database.getObjectLike(`${argv.name}%`)
      if (commit == undefined){
        logger.error("client", ('Branch/Commit does not exist'))
      } else {
      const currHead = fs.readFileSync('./.twig/HEAD', 'utf8');
      let curr_branch_commit
      if (database.getBranch(currHead) !== undefined){
      curr_branch_commit = database.getBranch(currHead).commit_hash
      } else {
        curr_branch_commit = currHead
      }

      const cur_treeIn = (JSON.parse(database.getObject(curr_branch_commit).data).tree)
      const curr_files = getTreeFiles(cur_treeIn)
      const currRead = getDirectoryFiles('./')
      const remote_comparison_files = []
      const local_comparison_files = []
      for (const file of curr_files){
        remote_comparison_files.push([path.join(file[0].slice(1, file[0].length), file[1]), file[2]])
      }

      for (const file of currRead){
        local_comparison_files.push([file, crypto.hash(fs.readFileSync(file, 'utf8'))])
      }

      if (JSON.stringify(remote_comparison_files.sort()) !== JSON.stringify(local_comparison_files.sort())){
        //console.log('LOCAL: ', local_comparison_files.sort())
        //console.log('REMOTE: ', remote_comparison_files.sort())
        logger.warning("client", ('cannot change branches with uncommitted changes.'))
      } else {

        const treeIn = (JSON.parse(database.getObjectLike(`${argv.name}%`).data).tree)
        loadCommitToDirectory(treeIn)

      if (argv.b){
        database.newBranch(argv.b, commit.hash)
        console.log('Branch ' + chalk.magenta.bold(argv.b) + ' created')
        logger.output('Current HEAD: Branch ' + chalk.magenta.bold(argv.b))
        fs.writeFileSync('./.twig/HEAD', argv.b, 'utf8');

      } else {
        console.log('Current HEAD: Commit ' + chalk.magenta.bold(commit.hash.slice(0,8)))
        fs.writeFileSync('./.twig/HEAD', commit.hash, 'utf8');
      }
      }

      }

    } else {

      if (database.getBranch(argv.name).commit_hash == null){
        fs.writeFileSync('./.twig/HEAD', argv.name, 'utf8');
        logger.output('Current HEAD: Branch ' + chalk.magenta.bold(argv.name))
        process.exit()
      } else {
      
      if (uncommittedChanges()){
        logger.warning("client", ('cannot change branches with uncommitted changes.'))
      } else {
    

      fs.writeFileSync('./.twig/HEAD', argv.name, 'utf8');

      const branch_commit = database.getBranch(argv.name).commit_hash
      const treeIn = (JSON.parse(database.getObject(branch_commit).data).tree)
      loadCommitToDirectory(treeIn)

      logger.output('Current HEAD: Branch ' + chalk.magenta.bold(argv.name))
    }
      

      }
    }
    }
  ).command(
    'branches', 
    'List all branches and their latest commits, along with your current branch', 
    (yargs) => {
    }, 
    (argv) => {
      
      const currentBranch = fs.readFileSync('./.twig/HEAD', 'utf8')
      const branches = database.getAllBranches()
      for (const branch of branches){
        logger.output(branch.name == currentBranch ? 'Branch ' + chalk.magenta.bold(branch.name + chalk.hex("#ff7b00")(" (HEAD)")) + ' - ' + (branch.commit_hash == null ? '(no latest commit)' :branch.commit_hash.slice(0, 8) + ' (latest commit)'): 'Branch ' + chalk.magenta.bold(branch.name) + ' - ' + (branch.commit_hash == null ? '(no latest commit)' :branch.commit_hash.slice(0, 8) + ' (latest commit)'))
      }
    }

  ).command( 
    'login', 
    'login to twig-cli', 
    (yargs) => {}, 
    async (argv) => {

      const token = fs.readFileSync(path.join(paths.data, 'TOKEN' ), 'utf8'); 

      const res = await fetch('https://twig-cli.vercel.app/api/isLogin', {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${token}` 
        },
      });

      const result = await res.json();
      if (result.success){
        console.log(chalk.greenBright('Already logged in'))
      }
      else {
      const app = express();

app.get('/', (req, res) => {
  const token = req.query.token;
 
  if (token) {
    if (token == "FATAL"){
      res.send('<script>window.location.replace(\'https://twig-cli.vercel.app/auth/error?error=cli&code=Login%20cancelled\')</script>');
      server.closeAllConnections()
      server.close();
      console.log(chalk.redBright("Login cancelled"));
    } else {
    res.send('<script>window.location.replace(\'https://twig-cli.vercel.app/auth/error?error=cli&code=Successfully%20logged%20in\')</script>');
    fs.writeFileSync(path.join(paths.data, 'TOKEN'), token);
    console.log(chalk.greenBright('Logged in'));
    server.closeAllConnections()
    server.close();
    }
  }
});

const server = app.listen(4321, () => {
  console.log(chalk.yellowBright('Redirecting to login...\nUse CTRL + C to cancel'));
  exec(`start https://twig-cli.vercel.app/auth/login?callback=http://localhost:4321`);
});

process.on('SIGINT', function() {
  console.log(chalk.redBright("Login cancelled"));
  process.exit();
});
}

    }
  ).command(
    'push', 
    'push files', 
    (yargs) => {}, 
    (argv) => {

      const db = database.getDb();

      const branches = database.getAllBranches();
const objects = db.prepare("SELECT * FROM objects").all();

const exportData = {
    branches,
    objects
};

const json = JSON.stringify(exportData);

    async function testPush(){

      const token = fs.readFileSync(path.join(paths.data, 'TOKEN' ), 'utf8'); 
      
      const formData = new FormData();
      formData.append('name', fs.readFileSync('./.twig/CONFIG', 'utf8').split('\n')[0]);
      formData.append('sql', json)
      formData.append('local_id', fs.readFileSync('./.twig/CONFIG', 'utf8').split('\n')[2])      
      const files = fs.readdirSync('./.twig/files', {
        withFileTypes: true 
    });

    for (const currFile of files) {
      const fullPath = path.join('./.twig/files/' + currFile.name)

      formData.append(
        "files",
        new Blob([fs.readFileSync(fullPath)]),
        currFile.name
    );
  }

          const res = await fetch('https://twig-cli.vercel.app/api/push', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}` 
        },
        body: formData
      });

      const result = await res.json();
      if (!result.success){

        console.log(chalk.redBright(result.error))
      } else {
          console.log('Pushed successfully')
      }
      if (result.newRefreshToken) {
        fs.writeFileSync(path.join(paths.data, 'TOKEN' ), result.newRefreshToken);
      }


      }


      testPush()

    }
  ).command(
    'gui', 
    'launch GUI', 
    (yargs) => {
    }, 
    (argv) => {

const app = express();
const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/branches/:branch', (req, res) => {
  res.send(getBranchCommitHistory(database.getBranch(req.params.branch).commit_hash))

});

app.get('/api/allBranches', (req, res) => {
  res.send(database.getAllBranches())

});

app.get('/api/commit/fileTree/:commit', (req, res) => {
  res.send(treeContents(JSON.parse(database.getObject(req.params.commit).data).tree))
});

app.get('/api/commit/folderTree/:commit', (req, res) => {
  res.send(treeContents(req.params.commit))
});

app.get('/branch/:branch', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
});

app.get('/branch/:branch/*path', (req, res) => {

  if (req.params.path.at(-2) == "file"){
    const dirname = __dirname.split(`\\`)
    dirname.pop()

    const file = fs.readFileSync(path.join(process.cwd(), '.twig/files', req.params.path.at(-1)), "utf8");
    res.type("text/plain").send(file);


  } else {
  res.sendFile(path.join(__dirname, 'index.html'))
  }
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});  

      }
  ).command(
    'merge <name> [options]', 
    'merge two branches', 
    (yargs) => {
      return yargs.positional('name', {
        describe: 'branch to merge into current branch',
        type: 'string',
      }).option('force', {
        alias: 'force',
        describe: 'force a merge if unrelatedHistories error'
      })
    }, 
    async (argv) => {

    if (database.getBranch(argv.name) == undefined){

      logger.error("client", ('Branch provided does not exist'))

    } else {

      const currBranch = fs.readFileSync('./.twig/HEAD', 'utf8')
      const currBranchLatestCommit = database.getBranch(currBranch).commit_hash
      const mergeBranchLatestCommit = database.getBranch(argv.name).commit_hash

      if (ancestry(currBranchLatestCommit, mergeBranchLatestCommit)){

            logger.log("engine", "merging via latest commit")

            const folderPath = './';
            const initalfiles = fs.readdirSync(folderPath)
            const files = initalfiles.filter(item => item.startsWith('.twig') !== true)

            for (const file of files) {
  const curPath = path.join(folderPath, file);
  try {
    fs.rmSync(curPath, { recursive: true, force: true });
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EBUSY') {
      if (fs.statSync(curPath).isFile()) {
        fs.writeFileSync(curPath, '');
      }
    } {
      console.error(err.message);
    }
  }
            }
            const treeIn = (JSON.parse(database.getObject(mergeBranchLatestCommit).data).tree)
            const filesToMake = getTreeFiles(treeIn)

            for (const file of filesToMake){
            const content = fs.readFileSync('./.twig/files/' + file[2], 'utf8');
            fs.mkdirSync('./' + file[0], { recursive: true }, (err) => {
              console.log(err)
            });
            fs.writeFileSync('./' + file[0] + file[1], content, 'utf8');

      }
            database.setParentBranch(mergeBranchLatestCommit, currBranch)
            const BranchDeletion = await confirm({ message: `Would you like to delete branch ${chalk.magenta.bold(argv.name)} after merging?` });
        if (BranchDeletion){

          database.deleteBranch(argv.name)

        }
            logger.success("client", `Sucessfully merged ${chalk.magenta.bold(argv.name)} into ${chalk.magenta.bold(currBranch)}`)

            // ------------------------------------------------------------------------------------------------------------------------------------------------------
    } else {
            logger.log("engine", "using common base merge")
            const base = findCommonBase(currBranchLatestCommit, mergeBranchLatestCommit)
            let baseTree;
            if (base == null && !argv.force){
              logger.error('engine', "refusing to merge unrelated histories. use --force")
              process.exit()
            } else if (base == null && argv.force){
              logger.warning("client", "using --force to merge unrelated histories.")
              baseTree = {}
            } else {
              baseTree = getTreeFilesAndHash((JSON.parse(database.getObject(base).data).tree))
              logger.log("engine", "base commit " + base + " found")
            }
            const currBranchTree = getTreeFilesAndHash((JSON.parse(database.getObject(currBranchLatestCommit).data).tree))
            const mergeBranchTree = getTreeFilesAndHash(JSON.parse(database.getObject(mergeBranchLatestCommit).data).tree) 
            const baseMap = new Map(Object.entries(baseTree));
            const currMap = new Map(Object.entries(currBranchTree));
            const mergeMap = new Map(Object.entries(mergeBranchTree));

            const allPaths = new Set([
            ...baseMap.keys(),
            ...currMap.keys(),
            ...mergeMap.keys()
            ])

                    
            const merged = new Map();
            const conflicts = [];
            
            for (const path of allPaths) {
            const baseHash = baseMap.get(path);
            const currHash = currMap.get(path);
            const mergeHash = mergeMap.get(path);

            baseHash == currHash && baseHash == mergeHash ? "":(baseHash != currHash ? (baseHash != mergeHash ? logger.output(path + " has changes in both branches") : logger.output(path + " has changes in current branch")) : logger.output(path + " has changes in merge branch"))
    

            const action = classify(baseHash,currHash,mergeHash);

        switch (action.type) {

        case "UNCHANGED":
            if (action.hash !== undefined)
                merged.set(path, action.hash);
            break;

        case "USE_CURRENT":
            if (action.hash !== undefined)
                merged.set(path, action.hash);
            break;

        case "USE_MERGE":
            if (action.hash !== undefined)
                merged.set(path, action.hash);
            break;

        case "SAME_CHANGE":
            if (action.hash !== undefined)
                merged.set(path, action.hash);
            break;

        case "CONFLICT":
            conflicts.push([path, action.currHash, action.mergeHash]);
            break;
    }
          }
            
          if (conflicts.length > 0){

            for (const conflict of conflicts){
              logger.warning("client", "MERGE CONFLICT IN: " + conflict[0])
              const keep = await input({ message: `Which branch changes would you like to keep? (${currBranch}, ${argv.name})`});
              if (keep == currBranch){
                merged.set(conflict[0], conflict[1])
              } else if (keep == argv.name) {
                merged.set(conflict[0], conflict[2])

              }

            }
            


          }  
          

          const root = {
    directories: {},
    files: {}
};

for (const [filePath, hash] of merged) {

    const parts = filePath.split("/").filter(Boolean);

    let curr = root;

    for (let i = 0; i < parts.length - 1; i++) {

        const dir = parts[i];

        if (!curr.directories[dir]) {
            curr.directories[dir] = {
                directories: {},
                files: {}
            };
        }

        curr = curr.directories[dir];
    }

    curr.files[parts.at(-1)] = hash;
}


      const rootHash = writeMergeTree(root);

      const commitinfo = {
        tree: rootHash,
        message: `Merged ${argv.name} into ${currBranch}`,
        parent:currBranchLatestCommit,
        when: Date.now()
        };


    loadCommitToDirectory(rootHash)

        database.insertObject(crypto.hash(JSON.stringify(commitinfo)), "commit", JSON.stringify(commitinfo))
        database.setParentBranch(crypto.hash(JSON.stringify(commitinfo)), currBranch)
        const BranchDeletion = await confirm({ message: `Would you like to delete branch ${chalk.magenta.bold(argv.name)} after merging?` });
        if (BranchDeletion){

          database.deleteBranch(argv.name)

        }
        logger.success("client", `Sucessfully merged ${chalk.magenta.bold(argv.name)} into ${chalk.magenta.bold(currBranch)}`)
      }

    }
    }
  ).command(
    'rollback <commit>', 
    'restores repository to the state at that commit', 
    (yargs) => {
      return yargs.positional('commit', {
        describe: 'commit to rollback to',
        type: 'string',
      })
    }, 
    async (argv) => {

    const rollback_confirm = await confirm({ message: `${chalk.redBright('Are you sure you would like to rollback?')}` });

    if (rollback_confirm){

      
    const spinner = ora('Restoring files...').start();

      const commitTree = JSON.parse(database.getObjectLike(`${argv.commit}%`).data).tree
      loadCommitToDirectory(commitTree)

      const currentBranch = fs.readFileSync('./.twig/HEAD', 'utf8')

    database.setParentBranch(database.getObjectLike(`${argv.commit}%`).hash, currentBranch)
      
    spinner.succeed(`Successfully rolled back to ${chalk.blueBright(argv.commit)}`)

    }
  }
  ).command(
    'gh', 
    'pushes to github', 
    (yargs) => {
    }, 
    async (argv) => {

      const spinner = ora('Pushing...').start()

      const ALREADY_PUSHED = fs.readFileSync('./.twig/REMOTE', 'utf8');

      spinner.text = `Pushing...${ALREADY_PUSHED ? "remote found":"remote not found"}` 

      let branchExists = true

      const octokit = new Octokit({ auth: GITHUB_SECRET });
    
      const currBranch = fs.readFileSync('./.twig/HEAD', 'utf8') 

      const OWNER = "anshxlm";
      const REPO = "twigtesting";
      const BRANCH = currBranch == "master" ? "main":currBranch; 

      let currentParentSha = null;

    try {

      const { data: refData } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/ref/heads/{branch}",
      { owner: OWNER, repo: REPO, branch: BRANCH }
    );

      currentParentSha = refData.object.sha
  } catch (error) {

    if (error.status === 404) {
    branchExists = false;
    }


  }

  let commitList
if (!ALREADY_PUSHED){
  console.time('commitList')
  commitList = getBranchCommitHistory(database.getBranch(currBranch).commit_hash).toReversed()
  fs.writeFileSync('./.twig/REMOTE', "true", 'utf8');
  console.timeEnd('commitList')

}  else {
console.time('commitList')
  commitList = getUnpushedCommitHistory(database.getBranch(currBranch).commit_hash)
  console.timeEnd('commitList')
}

if (commitList.length == 0){

  spinner.fail('No changes to push')
} else {
  for (let i = 0; i<commitList.length; i++){
  console.log(`${i}/${commitList.length}`)
  let trees
  spinner.text = 'Preparing...'
  console.time('PREPARE')
  if (!ALREADY_PUSHED && i == 0){
      trees = await uploadFirstTree(commitList[i].tree, "", [], spinner)
  } else {
    const parent_commit = JSON.parse(database.getObject(commitList[i].hash).data).parent
    trees = await deltaUpload(getTreeFilesAndHash(JSON.parse(database.getObject(parent_commit).data).tree), getTreeFilesAndHash(commitList[i].tree), spinner)
  }
  console.timeEnd('PREPARE')
  spinner.text = 'Processing...'
   if (trees.length == 0){
    database.updateCommitSha('NOT PUSHED', commitList[i].hash)
    continue
   } else {

    const { data: treeData } = await octokit.request("POST /repos/{owner}/{repo}/git/trees", {
        owner: OWNER,
        repo: REPO,
        tree: trees,
        base_tree: currentParentSha
      });

      const { data: commitData } = await octokit.request("POST /repos/{owner}/{repo}/git/commits", {
        owner: OWNER,
        repo: REPO,
        message: commitList[i].message,
        tree: treeData.sha,
        parents: currentParentSha ? [currentParentSha] : []
      });
    
    database.updateCommitSha(commitData.sha, commitList[i].hash)
    currentParentSha = commitData.sha;

  }
}
  

    
  if (branchExists){
  
    const { data: finalRef } = await octokit.request(
      "PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}",
      {
        owner: OWNER,
        repo: REPO,
        branch: BRANCH,
        sha: currentParentSha,
        force: false
      }
    );

    spinner.succeed(`Pushed to Github. Commit: ${chalk.magenta.bold(finalRef.object.sha.slice(0,7))}`)

  } else {

  const { data: finalRef } = await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
    owner: OWNER,
    repo: REPO,
    ref: `refs/heads/${BRANCH}`,
    sha: currentParentSha
  });

  spinner.succeed(`Pushed to Github. Commit: ${chalk.magenta.bold(finalRef.object.sha.slice(0,7))}`)
}

}
    }
  ).help()
  .showHelpOnFail(true)
  .demandCommand()
  .parse()