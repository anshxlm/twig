#!/usr/bin/env node
import yargs from 'yargs';
import express from 'express';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import ora from 'ora';
import envPaths from 'env-paths';
import { input } from '@inquirer/prompts';
import fs, { existsSync, read } from 'node:fs';
import crypto, { randomBytes, randomUUID } from 'node:crypto'
import path from "path";
import Database from 'better-sqlite3';import { create } from 'node:domain';
import { fileURLToPath } from 'url';
import { get } from 'node:https';
import { dirname } from 'node:path';
import http from 'http';
import { exec } from 'child_process';
import test from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;
const paths = envPaths('twigvcs', {suffix:''});
export function getDb() {
    if (!db) {
        db = new Database("./.twig/tree.db");
        db.pragma("journal_mode = WAL");
    }

    return db;
}

/*
function uploadTwig(where){
  
      const files = fs.readdirSync(where, {
        withFileTypes: true
    });

    for (const currFile of files) {

        const fullPath = path.join(where, currFile.name);

        if (currFile.isDirectory()) {

            const treeHash = uploadTwig(fullPath);

        } else {
            const content = fs.readFileSync(fullPath, 'utf8');

            entries.push({
                name: currFile.name,
                type: "blob",
                hash: hash(content)
            });

        }
    }
}
*/

function readTree(where) {
  const db = getDb();

  const insertObject = db.prepare(`
    INSERT INTO objects (hash, type, data)
    VALUES (?, ?, ?)
`);

    const entries = [];

    const initalfiles = fs.readdirSync(where, {
        withFileTypes: true
    });

    const files = initalfiles.filter(item => item.parentPath !== ".twig" && item.name !== ".twig")

    for (const currFile of files) {

        const fullPath = path.join(where, currFile.name);

        if (currFile.isDirectory()) {

            const treeHash = readTree(fullPath);

            entries.push({
                name: currFile.name,
                type: "tree",
                hash: treeHash
            });

        } else {
            const content = fs.readFileSync(fullPath, 'utf8');

            entries.push({
                name: currFile.name,
                type: "blob",
                hash: hash(content)
            });

        }
    }

    const treeHash = hash(JSON.stringify(entries));
  try {
    insertObject.run(
        treeHash,
        "tree",
        JSON.stringify(entries)
    );
  } catch (err) {
  }

    return treeHash;
}
function generateTree( where ){

const dirs = []
const initalfiles = fs.readdirSync(where, {
  recursive: true,
  withFileTypes:true
},
 (err) => {
  }
);


const files = initalfiles.filter(item => item.parentPath.startsWith('.twig') !== true && item.name !== ".twig")

for ( let i=0; i<files.length; i++){

if (files[i].isFile()){
    dirs.push((path.join(files[i].parentPath, files[i].name)))
} else {
    generateTree(path.join(files[i].parentPath, files[i].name))
}

}
return dirs
}

function hash(data) {
    return crypto.createHash("sha1").update(data).digest("hex");
}

function consoleTree(treeHash, indent = "") {
  const db = getDb();
  const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash LIKE ?
    `);

    const treeIn = JSON.parse(getObject.get(treeHash).data);

    for (let i = 0; i < treeIn.length; i++) {

        const last = i === treeIn.length - 1;

        console.log(indent +(last ? "└──" : "├──") +treeIn[i].name);

        if (treeIn[i].type === "tree") {
            consoleTree(treeIn[i].hash,indent + "│   ");
        }
    }
}

function guiTree(treeHash, indent = "",) {
  const db = getDb();
  const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash LIKE ?
    `)

  const guiArray = []

    const treeIn = JSON.parse(getObject.get(treeHash).data);

    for (let i = 0; i < treeIn.length; i++) {

        const last = i === treeIn.length - 1;

        guiArray.push(treeIn[i]);

        if (treeIn[i].type === "tree") {
            guiTree(treeIn[i].hash,indent + "│    ",);
        }
    }
  
    return guiArray
}

function getBranchCommitHistory(branch_hash){

  const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash = ?
    `);

  let hash = branch_hash

   const historyArr = []; 

  while (hash) {

    const commit = JSON.parse(getObject.get(hash).data);

    historyArr.push({hash:hash, message:commit.message})

    hash = commit.parent;
} 

  return historyArr

}

function createBranchTree(treeHash, indent = "") {
  const db = getDb();
  const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash LIKE ?
    `);

    const treeIn = JSON.parse(getObject.get(treeHash).data);

    for (let i = 0; i < treeIn.length; i++) {

        const last = i === treeIn.length - 1;

        console.log(indent +(last ? "└──" : "├──") +treeIn[i].name);

        if (treeIn[i].type === "tree") {
            createBranchTree(treeIn[i].hash,indent + "│   ");
        }
    }
}


function getBranchFiles(branch, currPath="/", allFiles = []) {
  const db = getDb();

  const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash LIKE ?
    `);

    const treeIn = JSON.parse(getObject.get(branch).data);

    for (const subtree of treeIn) {

        if (subtree.type == "tree") {
            getBranchFiles(subtree.hash, currPath + subtree.name + '/', allFiles);
        } else {
          allFiles.push([currPath, subtree.name, subtree.hash]);
        }
    }

    return allFiles
}

function compareTree(treeHash, path="/", files ={}) {
const db = getDb();
  const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash LIKE ?
    `);

    const treeIn = JSON.parse(getObject.get(treeHash).data)


    for (const subtree of treeIn) {
        if (subtree.type === "tree") {
            compareTree(subtree.hash, path + subtree.name + "/", files);
        } else {
            const pathTree = path + subtree.name
            files[pathTree] = subtree.hash
        }
    }

    return files
}

function comparison(tree1, tree2){


const allFiles = new Set([...Object.keys(tree1), ...Object.keys(tree2)]);

for (const file of allFiles) {

    if (!(file in tree1)) {
        console.log("ADDED:", file);
    }

    else if (!(file in tree2)) {
        console.log("DELETED:", file);
    }

    else if (tree1[file] !== tree2[file]) {
        console.log("MODIFIED:", file);
    }
}
}


function ancestry(ancestor, descendant){
  const db = getDb()
  const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash = ?
    `);

  let currentHash = descendant
  while (currentHash){
      if (currentHash == getObject.get(ancestor).hash){
          return true
        }
        const commit = JSON.parse(getObject.get(currentHash).data);
        currentHash = commit.parent;
      }
    return false

}

function findCommonBase(currCommit, branchCommit){

  const db = getDb()
  const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash = ?
    `);

  let curr = currCommit
  const visited = new Set();

    while (curr) {
        visited.add(curr);
        curr = JSON.parse(getObject.get(curr).data).parent
    }

    let branchCurr = branchCommit

    while (branchCurr) {
        if (visited.has(branchCurr))
            return branchCurr;

        b = b.parent;
    }

    return null;

}

const cli = yargs(hideBin(process.argv))
  .scriptName('twig')
  .usage('Usage: $0 <command> [options]')
  .command(
    '$0', 
    'Shows Version', 
    () => {}, 
    (argv) => {
      console.log('Version 1.0.0')
    }
  )
  .command(
    'init',
    'Initialize',
    (yargs) => {},
    async (argv) => {  

    const spinner = ora('Initializing\n').start();
        fs.mkdir('./.twig', (err) => {
          if (!(err == null)){
          if (!(err.code == 'EEXIST')){
            console.log(err)
          }
        }
        });
        const filePath = './.twig';
        if (existsSync(filePath)){
          console.log()
          spinner.fail('twig is already initialized here!')
        } 
        else {
          spinner.stop()

           const repoName = await input({ message: 'what is your repository name?' });
          
        spinner.start()

          fs.writeFileSync('./.twig/CONFIG', repoName + '\n' + 'WARNING: DO NOT EDIT THIS ID. DOING SO WILL FATALLY AFFECT REMOTE' + '\n' + randomUUID(), 'utf8');

        const db = getDb();
        db.exec(`
  CREATE TABLE IF NOT EXISTS objects (
    hash TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL
);
`);

          db.exec(`
  CREATE TABLE IF NOT EXISTS branches (
    name TEXT PRIMARY KEY,
    commit_hash TEXT NOT NULL
);
`);

        const initTree = generateTree('./')
        
        fs.mkdir('./.twig/files', (err) => {
           
        });

        for (const file of initTree){

        const content = fs.readFileSync(file, 'utf8');
        fs.writeFileSync('./.twig/files/' + hash(content), content, 'utf8');
        }
        readTree('./')

        const commitRoot = readTree('./')

          const insertObject = db.prepare(`
          INSERT INTO objects (hash, type, data)
          VALUES (?, ?, ?)
          `);

          const newBranch = db.prepare(`
          INSERT INTO branches (name, commit_hash)
          VALUES (?, ?)
          `);

        const commitinfo = {
        tree: commitRoot,
        message: "Initial Commit",
        parent:null,
        when: Date.now()
        };

        
        fs.writeFileSync('./.twig/HEAD', "master", 'utf8');

        newBranch.run("master", hash(JSON.stringify(commitinfo)))

        insertObject.run(hash(JSON.stringify(commitinfo)), "commit", JSON.stringify(commitinfo))
        spinner.succeed(chalk.green('./.twig') + " initialized")

        }
     }
  )
  .command(
    'commit',
    'commit changes',
    (yargs) => {
      return yargs.option('m', {
        alias: 'message',
        describe: 'the commit message'
      })
    },
    async (argv) => {
      let msg = argv.m
      if (!argv.m){
        msg = await input({ message: 'what is your commit message' });
      }
      
      console.log(chalk.bold(chalk.blue("committing with message: ")) + msg)

      const initTree = generateTree('./')

        for (const file of initTree){
        
        const content = fs.readFileSync(file, 'utf8');

        if (fs.existsSync('./.twig/files/' + hash(content))) {
        } else {
        
        fs.writeFileSync('./.twig/files/' + hash(content), content, 'utf8');
        }
        }
  
         const commitRoot = readTree('./')

          const insertObject = db.prepare(`
          INSERT INTO objects (hash, type, data)
          VALUES (?, ?, ?)
          `);
        
          
        const parentBranch = fs.readFileSync('./.twig/HEAD', 'utf8');

    
        const getParent = db.prepare(`
    SELECT commit_hash FROM branches
    WHERE name = ?
    `);
        const setParentBranch = db.prepare(`
    UPDATE branches
    SET commit_hash = ?
    WHERE name = ?;
    `);

          let parent
          if (getParent.get(parentBranch) == undefined){
            parent = parentBranch
          } else {
            parent = getParent.get(parentBranch).commit_hash
          }

        const commitinfo = {
        tree: commitRoot,
        message: msg,
        parent:parent,
        when: Date.now()
        };

        insertObject.run(hash(JSON.stringify(commitinfo)), "commit", JSON.stringify(commitinfo))
      if (getParent.get(parentBranch) == undefined){
          fs.writeFileSync('./.twig/HEAD', hash(JSON.stringify(commitinfo)), 'utf8');
      } else {
        setParentBranch.run(hash(JSON.stringify(commitinfo)), parentBranch)
      }

    }
  ).command(
    'compare <c1> <c2>', 
    'compare two commits', 
    (yargs) => {
      return yargs.positional('c1', {
        describe: 'commit 1 to compare',
        type: 'string',
      }).positional('c2', {
        describe: 'commit 2 to compare',
        type: 'string',
      })
    }, 
    (argv) => {
      const db = getDb();

      const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash LIKE ?
    `);

      let currentHash = JSON.parse(getObject.get(`${argv.c2}%`).data).parent
      let first = false;

      while (currentHash){
        if (currentHash == getObject.get(`${argv.c1}%`).hash){
          first = true
          comparison(compareTree(JSON.parse(getObject.get(`${argv.c1}%`).data).tree), compareTree(JSON.parse(getObject.get(`${argv.c2}%`).data).tree))
        }
        const commit = JSON.parse(getObject.get(currentHash).data);
        currentHash = commit.parent;
      }
      if (!first){
        comparison(compareTree(JSON.parse(getObject.get(`${argv.c2}%`).data).tree), compareTree(JSON.parse(getObject.get(`${argv.c1}%`).data).tree))
      }
      
    }
  ).command(
    'log', 
    'commit history', 
    () => {}, 
    (argv) => {
      const db = getDb();

      const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash = ?
    `);

        const getParent = db.prepare(`
    SELECT commit_hash FROM branches
    WHERE name = ?
    `);

      const parentBranch = fs.readFileSync('./.twig/HEAD', 'utf8');
      let hash;
      if (getParent.get(parentBranch) !== undefined){
       hash = getParent.get(parentBranch).commit_hash
      } else {
        hash = parentBranch
      }
    

   const historyArr = []; 

  while (hash) {

    const commit = JSON.parse(getObject.get(hash).data);

    historyArr.push({hash:hash, message:commit.message})

    hash = commit.parent;
} 
  console.log()

  for (const [index, msg] of historyArr.toReversed().entries()){
    if (index == 0){
      console.log(chalk.bold(msg.message) + ' ' + chalk.yellow(msg.hash.slice(0, 8)))
    }
    else {
    console.log(msg.message  + ' ' + chalk.yellow(msg.hash.slice(0, 8)))
    }
  }

//  console.log('\nRoot')
 //deprecated and not needed: consoleTree(JSON.parse(getObject.get(getParent.get(parentBranch).commit_hash).data).tree)

    }
  ).command(
    'branch <name>', 
    'create new branch', 
    (yargs) => {
      return yargs.positional('name', {
        describe: 'name of new branch',
        type: 'string',
      })
    }, 
    (argv) => {
      const db = getDb();

      const newBranch = db.prepare(`
          INSERT INTO branches (name, commit_hash)
          VALUES (?, ?)
          `);
      
      const parentBranch = fs.readFileSync('./.twig/HEAD', 'utf8');
        const getParent = db.prepare(`
    SELECT commit_hash FROM branches
    WHERE name = ?
    `);

    newBranch.run(argv.name, getParent.get(parentBranch).commit_hash)

    console.log("New branch " + chalk.magenta.bold(argv.name) + " created")

      }
  ).command(
    'checkout <name>', 
    'checkout branch', 
    (yargs) => {
      return yargs.positional('name', {
        describe: 'name of branch',
        type: 'string',
      }).option('b', {
        alias: 'branch',
        describe: 'create a new branch if checking out a commit'
      })
    }, 
    (argv) => {
      const db = getDb();

  const getBranch = db.prepare(`
    SELECT * FROM branches
    WHERE name LIKE ?
    `);
  
    const newBranch = db.prepare(`
          INSERT INTO branches (name, commit_hash)
          VALUES (?, ?)
          `);
      

  const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash LIKE ?
    `);

      const exists = db.prepare(`
    SELECT * FROM branches
    WHERE name = ?
    `);

    if (exists.get(argv.name) == undefined){
      const commit = getObject.get(`${argv.name}%`)
      if (commit == undefined){
        console.log(chalk.redBright('Branch/Commit does not exist'))
      } else {

      const currHead = fs.readFileSync('./.twig/HEAD', 'utf8');
      let curr_branch_commit
      if (exists.get(currHead) !== undefined){
      curr_branch_commit = getBranch.get(currHead).commit_hash
      } else {
        curr_branch_commit = currHead
      }

      const cur_treeIn = (JSON.parse(getObject.get(curr_branch_commit).data).tree)
      const curr_files = getBranchFiles(cur_treeIn)
      const currRead = generateTree('./')
      const remote_comparison_files = []
      const local_comparison_files = []
      for (const file of curr_files){
        remote_comparison_files.push([path.join(file[0].slice(1, file[0].length), file[1]), file[2]])
      }

      for (const file of currRead){
        local_comparison_files.push([file, hash(fs.readFileSync(file, 'utf8'))])
      }

      if (JSON.stringify(remote_comparison_files) !== JSON.stringify(local_comparison_files)){
    
        console.log(chalk.yellowBright('Cannot change branches with uncommitted changes.'))
      } else {

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
      const treeIn = (JSON.parse(getObject.get(`${argv.name}%`).data).tree)
      const filesToMake = getBranchFiles(treeIn)

      for (const file of filesToMake){
      const content = fs.readFileSync('./.twig/files/' + file[2], 'utf8');
      fs.mkdirSync('./' + file[0], { recursive: true }, (err) => {
        console.log(err)
      });
      fs.writeFileSync('./' + file[0] + file[1], content, 'utf8');

      }



      if (argv.b){
        newBranch.run(argv.b, commit.hash)
        console.log('Branch ' + chalk.magenta.bold(argv.b) + ' created')
        console.log('Current HEAD: Branch ' + chalk.magenta.bold(argv.b))
        fs.writeFileSync('./.twig/HEAD', argv.b, 'utf8');

      } else {
        console.log('Current HEAD: Commit ' + chalk.magenta.bold(commit.hash.slice(0,8)))
        fs.writeFileSync('./.twig/HEAD', commit.hash, 'utf8');
      }
      }

      }

    } else {

            const currHead = fs.readFileSync('./.twig/HEAD', 'utf8');
      let curr_branch_commit
      if (exists.get(currHead) !== undefined){
      curr_branch_commit = getBranch.get(currHead).commit_hash
      } else {
        curr_branch_commit = currHead
      }
      const cur_treeIn = (JSON.parse(getObject.get(curr_branch_commit).data).tree)
      const curr_files = getBranchFiles(cur_treeIn)
      const currRead = generateTree('./')
      const remote_comparison_files = []
      const local_comparison_files = []
      for (const file of curr_files){
        remote_comparison_files.push([path.join(file[0].slice(1, file[0].length), file[1]), file[2]])
      }

      for (const file of currRead){
        local_comparison_files.push([file, hash(fs.readFileSync(file, 'utf8'))])
      }

      if (JSON.stringify(remote_comparison_files) !== JSON.stringify(local_comparison_files)){
    
        console.log(chalk.yellowBright('Cannot change branches with uncommitted changes.'))
      } else {
    

      fs.writeFileSync('./.twig/HEAD', argv.name, 'utf8');

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
      const branch_commit = getBranch.get(argv.name).commit_hash
      const treeIn = (JSON.parse(getObject.get(branch_commit).data).tree)
      const filesToMake = getBranchFiles(treeIn)

      for (const file of filesToMake){
      const content = fs.readFileSync('./.twig/files/' + file[2], 'utf8');
      fs.mkdirSync('./' + file[0], { recursive: true }, (err) => {
        console.log(err)
      });
      fs.writeFileSync('./' + file[0] + file[1], content, 'utf8');

      }

      console.log("Current HEAD: Branch " + chalk.magenta.bold(argv.name))
    }
      

      }
    }
  ).command(
    'branches', 
    'list all branches and their latest commits', 
    (yargs) => {
    }, 
    (argv) => {
      const db = getDb()
      const getBranches = db.prepare(`
        SELECT * FROM branches
        `)
      
      const branches = getBranches.all()
      for (const branch of branches){
        console.log('Branch ' + chalk.magenta.bold(branch.name) + ' - ' + branch.commit_hash.slice(0, 8) + ' (latest commit)')
      }

    })
    .command(
    'ai', 
    '', 
    (yargs) => {
    }, 
    async (argv) => {

      let active = true

      const commands = ["hello", "hey"]

      function isCommand(text){
        if (commands.includes(text.split(' ')[0])){
        return true
        } else {
          return false
        }
      }

      const db = getDb();
      console.log(chalk.yellow('Use CTRL+C to exit'))
while (active) {
    try {
      const answer = await input({
         message: chalk.bold(':'),
         theme:{
          prefix: chalk.magenta.bold('@twig/ai'),
          style:{
            answer:(text) => isCommand(text) ? chalk.greenBright(text) : chalk.redBright(text)
          }
         }
        })

      const command = answer.split(' ')[0]

      } catch (err) {
        if (err.name === 'ExitPromptError'){
          console.log('\nExited ' + chalk.magenta.bold('@twig/ai'))
          active = false;
        }
      }
      
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

      const db = getDb();

      const branches = db.prepare("SELECT * FROM branches").all();
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
      const db = getDb();

      const getBranches = db.prepare(`
        SELECT * from branches
        `)
      const getBranchCommits = db.prepare(`
        SELECT * from branches
        WHERE name = ?
        `)
      
        const getObjectByHash = db.prepare(`
        SELECT * from objects
        WHERE hash = ?
        `)

const app = express();
const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/branches/:branch', (req, res) => {
  res.send(getBranchCommitHistory(getBranchCommits.get(req.params.branch).commit_hash))

});

app.get('/api/allBranches', (req, res) => {
  res.send(getBranches.all())

});

app.get('/api/commit/fileTree/:commit', (req, res) => {
  res.send(guiTree(JSON.parse(getObjectByHash.get(req.params.commit).data).tree))
});

app.get('/api/commit/folderTree/:commit', (req, res) => {
  res.send(guiTree(req.params.commit))
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
    'merge <name>', 
    'merge two branches', 
    (yargs) => {
      return yargs.positional('name', {
        describe: 'branch to merge into current branch',
        type: 'string',
      })
    }, 
    (argv) => {
      const db = getDb()
      const branchLatestCommit = db.prepare(`
    SELECT * FROM branches
    WHERE name LIKE ?
    `);
    const setParentBranch = db.prepare(`
    UPDATE branches
    SET commit_hash = ?
    WHERE name = ?;
    `);

    const getObject = db.prepare(`
      SELECT * FROM objects
      WHERE hash = ?
      `)

      const currBranch = fs.readFileSync('./.twig/HEAD', 'utf8')
      const currBranchLatestCommit = branchLatestCommit.get(currBranch).commit_hash
      const mergeBranchLatestCommit = branchLatestCommit.get(argv.name).commit_hash

      if (ancestry(currBranchLatestCommit, mergeBranchLatestCommit)){

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
            const treeIn = (JSON.parse(getObject.get(mergeBranchLatestCommit).data).tree)
            const filesToMake = getBranchFiles(treeIn)

            for (const file of filesToMake){
            const content = fs.readFileSync('./.twig/files/' + file[2], 'utf8');
            fs.mkdirSync('./' + file[0], { recursive: true }, (err) => {
              console.log(err)
            });
            fs.writeFileSync('./' + file[0] + file[1], content, 'utf8');

      }
            setParentBranch.run(mergeBranchLatestCommit, currBranch)
            console.log(`Sucessfully merged ${chalk.magenta.bold(argv.name)} into ${chalk.magenta.bold(currBranch)}`)

            // ------------------------------------------------------------------------------------------------------------------------------------------------------
    } else {
            
            const base = findCommonBase(currBranchLatestCommit, mergeBranchLatestCommit)
            const baseTree = compareTree((JSON.parse(getObject.get(base).data).tree))
            const currBranchTree = compareTree((JSON.parse(getObject.get(currBranchLatestCommit).data).tree))
            const mergeBranchTree = compareTree(JSON.parse(getObject.get(mergeBranchLatestCommit).data).tree) 
            const baseMap = new Map(Object.entries(baseTree));
            const currMap = new Map(Object.entries(currBranchTree));
            const mergeMap = new Map(Object.entries(mergeBranchTree));

            const allPaths = new Set([
            ...baseMap.keys(),
            ...currMap.keys(),
            ...mergeMap.keys()
            ])
            for (const path of allPaths) {
            const baseHash = baseMap.get(path);
            const currHash = currMap.get(path);
            const mergeHash = mergeMap.get(path);

            console.log(path, (baseHash == currHash && baseHash == mergeHash ? "Unchanged":(baseHash != currHash ? (baseHash != mergeHash ? "Changes in both" : "Current branch ahead") : "Merge branch ahead")));
}

      }


    })
  .help()
  .parse()