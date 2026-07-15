#!/usr/bin/env node
import yargs from 'yargs';
import express from 'express';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import ora from 'ora';
import envPaths from 'env-paths';
import { input, password } from '@inquirer/prompts';
import { confirm } from '@inquirer/prompts';
import fs, { existsSync, read } from 'node:fs';
import crypto, { randomBytes, randomUUID } from 'node:crypto'
import path from "path";
import Database from 'better-sqlite3';import { create } from 'node:domain';
import { fileURLToPath } from 'url';
import { get } from 'node:https';
import { dirname } from 'node:path';
import http from 'http';
import { exec } from 'child_process';
import { Octokit } from "@octokit/core";


/* ---------------------------------------------------------- GLOBAL / SETUP --------------------------------------------------------------*/

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

/* ----------------------------------------------------------    DATABASE   --------------------------------------------------------------*/

function insertObject(hash,type,data){
    const db = getDb()
    const insertObject = db.prepare(`
        INSERT OR IGNORE INTO objects(hash,type,data)
        VALUES(?,?,?)
    `);
    return insertObject.run(hash,type,data)
}

function getObject(hash){
  const db = getDb()
  const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash = ?
    `)
  return getObject.get(hash)
}

function getObjectLike(hash){
  const db = getDb()
  const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash LIKE ?
    `);
  return getObject.get(hash)
}

function setParentBranch(hash, branchName){
  const db = getDb()
  const setParentBranch = db.prepare(`
    UPDATE branches
    SET commit_hash = ?
    WHERE name = ?;
    `);
  return setParentBranch.run(hash,branchName)

}

function getBranch(name){
  const db = getDb()
  const getParent = db.prepare(`
    SELECT * FROM branches
    WHERE name = ?
    `);
  return getParent.get(name)

}

function newBranch(name, commit_hash){
  const db = getDb()
  const newBranch = db.prepare(`
          INSERT INTO branches (name, commit_hash)
          VALUES (?, ?)
          `);
  return newBranch.run(name, commit_hash)
}

function getAllBranches(){
  const db = getDb()
  const getBranches = db.prepare(`
        SELECT * FROM branches
        `)
  return getBranches.all()

}

function deleteBranch(name){
  const db = getDb()
  const deleteBranch = db.prepare(`
            DELETE FROM branches
            WHERE name = ?
            `)

  return deleteBranch.run(name)

}

function updateCommitSha(commit, sha){
  const db = getDb()
  const update_commit_sha = db.prepare(`
    UPDATE objects
    SET commit_sha = ?
    WHERE hash = ?;
    `);
  return update_commit_sha.run(sha, commit)

}

/* ----------------------------------------------------------     ENGINE     --------------------------------------------------------------*/


// maps the file system into trees and then inserts them into database
function filesIntoDB(where, blobHashes) {

    const entries = [];

    const files = fs.readdirSync(where, {
        withFileTypes: true
    });

    for (const file of files) {

        if (file.name === ".twig") continue;
        if (file.name === "node_modules") continue;
        if (file.name === ".next") continue;
        if (file.name === "dist") continue;
        if (file.name === "build") continue;
        if (file.name === ".git") continue;

        const fullPath = path.join(where, file.name);

        if (file.isDirectory()) {

            const treeHash = filesIntoDB(fullPath, blobHashes);

            entries.push({
                name: file.name,
                type: "tree",
                hash: treeHash
            });

        } else {

            entries.push({
                name: file.name,
                type: "blob",
                hash: blobHashes.get(path.resolve(fullPath))
            });

        }

    }

    entries.sort((a,b)=>a.name.localeCompare(b.name));

    const treeHash = hash(JSON.stringify(entries));

    insertObject(treeHash, "tree", JSON.stringify(entries))

    return treeHash;
}

// returns all files in the current workspace
function getDirectoryFiles(dir, files = []) {

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {

        if (entry.name === ".twig") continue;
        if (entry.name === "node_modules") continue;
        if (entry.name === ".next") continue;
        if (entry.name === "dist") continue;
        if (entry.name === "build") continue;
        if (entry.name === ".git") continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            getDirectoryFiles(fullPath, files);
        } else {
            files.push(fullPath);
        }
    }

    return files;
}

// SHA-1 hash of data
function hash(data) {
    return crypto.createHash("sha1").update(data).digest("hex");
}

// console logs the tree layout of a tree
function consoleFileTree(treeHash, indent = "") {

    const treeIn = JSON.parse(getObjectLike(treeHash).data);

    for (let i = 0; i < treeIn.length; i++) {

        const last = i === treeIn.length - 1;

        console.log(indent +(last ? "└──" : "├──") +treeIn[i].name);

        if (treeIn[i].type === "tree") {
            consoleFileTree(treeIn[i].hash,indent + "│   ");
        }
    }
}

// returns the tree layout BUT at a tree by tree level
function treeContents(treeHash, indent = "",) {
  const db = getDb();

  const guiArray = []

    const treeIn = JSON.parse(getObject(treeHash).data);

    for (let i = 0; i < treeIn.length; i++) {

        const last = i === treeIn.length - 1;

        guiArray.push(treeIn[i]);
    }
  
    return guiArray
}

// get the commit history of a branch provided a branches latest commit
function getBranchCommitHistory(branch_hash){
  const db = getDb()
  
  let hash = branch_hash

   const historyArr = []; 

  while (hash) {

    const commit = JSON.parse(getObject(hash).data);

    historyArr.push({hash:hash, message:commit.message, tree:commit.tree})

    hash = commit.parent;
} 

  return historyArr

}

// only return commits of a branch that have not been pushed to github
function getUnpushedCommitHistory(branch_hash){
  const db = getDb()
  

  let hash = branch_hash
  const hasPushed = getObject(branch_hash).commit_sha

   const historyArr = []; 

if (!hasPushed){

  while (hash) {

    const commit = JSON.parse(getObject(hash).data);
    const pushed = getObject(hash).commit_sha

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
  const db = getDb();

    const treeIn = JSON.parse(getObject(branch).data);

    for (const subtree of treeIn) {

        if (subtree.type == "tree") {
            getTreeFiles(subtree.hash, currPath + subtree.name + '/', allFiles);
        } else {
          allFiles.push([currPath, subtree.name, subtree.hash]);
        }
    }

    return allFiles
}

// returns ONLY files of a tree as well, but in a specific format {path:hash}
function getTreeFilesAndHash(treeHash, path="", files ={}) {
const db = getDb();
  

    const treeIn = JSON.parse(getObjectLike(treeHash).data)


    for (const subtree of treeIn) {
        if (subtree.type === "tree") {
            getTreeFilesAndHash(subtree.hash, path + subtree.name + "/", files);
        } else {
            const pathTree = path + subtree.name
            files[pathTree] = subtree.hash
        }
    }

    return files
}

// compares sets of files (from getTreeFilesAndHash) to see what changes.
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

// checks if a commit is a descendant of another.
function ancestry(ancestor, descendant){
  const db = getDb()
  

  let currentHash = descendant
  while (currentHash){
      if (currentHash == getObject(ancestor).hash){
          return true
        }
        const commit = JSON.parse(getObject(currentHash).data);
        currentHash = commit.parent;
      }
    return false

}

// part of merging algorithm - finds a common commit
function findCommonBase(currCommit, branchCommit){

  const db = getDb()
  

  let curr = currCommit
  const visited = new Set();

    while (curr) {
        visited.add(curr);
        curr = JSON.parse(getObject(curr).data).parent
    }

    let branchCurr = branchCommit

    while (branchCurr) {
        if (visited.has(branchCurr)){
            return branchCurr;
        } else {

        branchCurr = JSON.parse(getObject(branchCurr).data).parent
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

    const treeHash = hash(JSON.stringify(entries));
try {

    insertObject(
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
        console.log(err)
      });
      fs.writeFileSync('./' + file[0] + file[1], content, 'utf8');

      }


}

// sends blobs to github for SHA but ONLY for the first commit of the first push. throttling set to 25
async function uploadFirstTree(treeHash, path = "", files = [], spinner) {
  const octokit = new Octokit({ auth: GITHUB_SECRET });
  const db = getDb();

  const OWNER = "anshxlm";
  const REPO = "twigtesting";

  spinner.text = "Building trees...";

  function gather(hash, currentPath) {
    const treeIn = JSON.parse(getObject(hash).data);

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

/* ---------------------------------------------------------- CLIENT --------------------------------------------------------------*/

const cli = yargs(hideBin(process.argv))
  .scriptName('twig')
  .usage('Usage: $0 <command> [options]'
  ).command(
    '$0', 
    'Shows Version', 
    () => {}, 
    (argv) => {
      console.log('Version 1.0.0')
    }
  ).command(
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

          fs.writeFileSync('./.twig/CONFIG', repoName + '\n' + 'WARNING: DO NOT EDIT THIS ID. DOING SO WILL FATALLY AFFECT REMOTE' + '\n' + randomUUID() + '\nfalse', 'utf8');
          fs.writeFileSync('./.twig/REMOTE', '', 'utf8');

        const db = getDb();
        db.exec(`
  CREATE TABLE IF NOT EXISTS objects (
    hash TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    commit_sha TEXT NULL
);
`);

          db.exec(`
  CREATE TABLE IF NOT EXISTS branches (
    name TEXT PRIMARY KEY,
    commit_hash TEXT NULL
);
`);

        //const initTree = getDirectoryFiles('./')
        
        fs.mkdir('./.twig/files', (err) => {
           
        });

        /*
        for (const file of initTree){

        const content = fs.readFileSync(file, 'utf8');
        fs.writeFileSync('./.twig/files/' + hash(content), content, 'utf8');
        }
        filesIntoDB('./')

        const commitRoot = filesIntoDB('./')


        const commitinfo = {
        tree: commitRoot,
        message: "Initial Commit",
        parent:null,
        when: Date.now()
        };

        */ 

        

        fs.writeFileSync('./.twig/HEAD', "master", 'utf8');

        //newBranch("master", hash(JSON.stringify(commitinfo)))
        newBranch("master", null)

        // insertObject(hash(JSON.stringify(commitinfo)), "commit", JSON.stringify(commitinfo))
        spinner.succeed(chalk.green('./.twig') + " initialized")

        }
     }
  ).command(
    'commit',
    'commit changes',
    (yargs) => {
      return yargs.option('m', {
        alias: 'message',
        describe: 'the commit message'
      })
    },
    async (argv) => {
      const db = getDb()
      let msg = argv.m

      if (!argv.m){
           msg = await input({ message: 'what is your commit message?', required:true,  validate: (value) => {
          if (value && value.toString().trim() !== '' && value !== '0' && value !== 'false') {
            return true;
          }
          return 'Please provide a input';
        }});
      }
      
      console.log(chalk.bold(chalk.blue("committing with message: ")) + msg)

      const spinner = ora('Generating tree...').start()

      const blobHashes = new Map();

spinner.text = "Hashing files...";

console.time("Hashing");

const initialFiles = getDirectoryFiles("./");

console.timeEnd("Hashing");

const files = initialFiles.filter(file =>
    !file.includes("node_modules") &&
    !file.includes(".twig")
);

console.time("Tree")
for (let i = 0; i < files.length; i++) {

    const file = files[i];

    spinner.text = `Hashing ${i + 1}/${files.length}`;

    const content = fs.readFileSync(file);

    const blobHash = hash(content);

    blobHashes.set(
        path.resolve(file),
        blobHash
    );

    const blobPath = `./.twig/files/${blobHash}`;

    if (!fs.existsSync(blobPath)) {
        fs.writeFileSync(blobPath, content);
    }

    if (i % 250 === 0)
        await new Promise(r => setImmediate(r));
}
console.timeEnd("Tree")

        spinner.text = 'Making tree...'
          
        const parentBranch = fs.readFileSync('./.twig/HEAD', 'utf8');

          let parent
          if (getBranch(parentBranch) == undefined){
            parent = parentBranch
          } else {
            parent = getBranch(parentBranch).commit_hash
          }

        const transaction = db.transaction(() => {

    const commitRoot = filesIntoDB("./", blobHashes);

          const commitinfo = {
        tree: commitRoot,
        message: msg,
        parent:parent,
        when: Date.now()
        };

    insertObject(
        hash(JSON.stringify(commitinfo)),
        "commit",
        JSON.stringify(commitinfo)
    );

            
      if (getBranch(parentBranch) == undefined){
          fs.writeFileSync('./.twig/HEAD', hash(JSON.stringify(commitinfo)), 'utf8');
      } else {
        setParentBranch(hash(JSON.stringify(commitinfo)), parentBranch)
      }

});

transaction();

spinner.succeed(`Processed ${files.length} files successfully.`)

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

      

      let currentHash = JSON.parse(getObjectLike(`${argv.c2}%`).data).parent
      let first = false;

      while (currentHash){
        if (currentHash == getObjectLike(`${argv.c1}%`).hash){
          first = true
          comparison(getTreeFilesAndHash(JSON.parse(getObjectLike(`${argv.c1}%`).data).tree), getTreeFilesAndHash(JSON.parse(getObjectLike(`${argv.c2}%`).data).tree))
        }
        const commit = JSON.parse(getObjectLike(currentHash).data);
        currentHash = commit.parent;
      }
      if (!first){
        comparison(getTreeFilesAndHash(JSON.parse(getObjectLike(`${argv.c2}%`).data).tree), getTreeFilesAndHash(JSON.parse(getObjectLike(`${argv.c1}%`).data).tree))
      }
      
    }
  ).command(
    'log', 
    'commit history', 
    () => {}, 
    (argv) => {
      const db = getDb();

      const parentBranch = fs.readFileSync('./.twig/HEAD', 'utf8');
      let hash;
      if (getBranch(parentBranch) !== undefined){
       hash = getBranch(parentBranch).commit_hash
      } else {
        hash = parentBranch
      }
    

   const historyArr = []; 

  while (hash) {
    const commit = JSON.parse(getObjectLike(hash).data);

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
 //deprecated and not needed: consoleFileTree(JSON.parse(getObject(getBranch(parentBranch).commit_hash).data).tree)

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
      
      const parentBranch = fs.readFileSync('./.twig/HEAD', 'utf8');

    newBranch(argv.name, getBranch(parentBranch).commit_hash)

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


    if (getBranch(argv.name) == undefined){
      const commit = getObjectLike(`${argv.name}%`)
      if (commit == undefined){
        console.log(chalk.redBright('Branch/Commit does not exist'))
      } else {

      const currHead = fs.readFileSync('./.twig/HEAD', 'utf8');
      let curr_branch_commit
      if (getBranch(currHead) !== undefined){
      curr_branch_commit = getBranch(currHead).commit_hash
      } else {
        curr_branch_commit = currHead
      }

      const cur_treeIn = (JSON.parse(getObject(curr_branch_commit).data).tree)
      const curr_files = getTreeFiles(cur_treeIn)
      const currRead = getDirectoryFiles('./')
      const remote_comparison_files = []
      const local_comparison_files = []
      for (const file of curr_files){
        remote_comparison_files.push([path.join(file[0].slice(1, file[0].length), file[1]), file[2]])
      }

      for (const file of currRead){
        local_comparison_files.push([file, hash(fs.readFileSync(file, 'utf8'))])
      }

      if (JSON.stringify(remote_comparison_files.sort()) !== JSON.stringify(local_comparison_files.sort())){
        //console.log('LOCAL: ', local_comparison_files.sort())
        //console.log('REMOTE: ', remote_comparison_files.sort())
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
      const treeIn = (JSON.parse(getObjectLike(`${argv.name}%`).data).tree)
      const filesToMake = getTreeFiles(treeIn)

      for (const file of filesToMake){
      const content = fs.readFileSync('./.twig/files/' + file[2], 'utf8');
      fs.mkdirSync('./' + file[0], { recursive: true }, (err) => {
        console.log(err)
      });
      fs.writeFileSync('./' + file[0] + file[1], content, 'utf8');

      }



      if (argv.b){
        newBranch(argv.b, commit.hash)
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
      if (getBranch(currHead) !== undefined){
      curr_branch_commit = getBranch(currHead).commit_hash
      } else {
        curr_branch_commit = currHead
      }
      const cur_treeIn = (JSON.parse(getObject(curr_branch_commit).data).tree)
      const curr_files = getTreeFiles(cur_treeIn)
      const currRead = getDirectoryFiles('./')
      const remote_comparison_files = []
      const local_comparison_files = []
      for (const file of curr_files){
        remote_comparison_files.push([path.join(file[0].slice(1, file[0].length), file[1]), file[2]])
      }

      for (const file of currRead){
        local_comparison_files.push([file, hash(fs.readFileSync(file, 'utf8'))])
      }

      if (JSON.stringify(remote_comparison_files.sort()) !== JSON.stringify(local_comparison_files.sort())){
    
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
      const branch_commit = getBranch(argv.name).commit_hash
      const treeIn = (JSON.parse(getObject(branch_commit).data).tree)
      const filesToMake = getTreeFiles(treeIn)

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
      
      const currentBranch = fs.readFileSync('./.twig/HEAD', 'utf8')
      const branches = getAllBranches()
      for (const branch of branches){
        console.log(branch.name == currentBranch ? 'Branch ' + chalk.magenta.bold(branch.name + chalk.hex("#ff7b00")(" (HEAD)")) + ' - ' + branch.commit_hash.slice(0, 8) + ' (latest commit)': 'Branch ' + chalk.magenta.bold(branch.name) + ' - ' + branch.commit_hash.slice(0, 8) + ' (latest commit)')
      }
    }

  ).command(
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

      const branches = getAllBranches();
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

const app = express();
const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/branches/:branch', (req, res) => {
  res.send(getBranchCommitHistory(getBranch(req.params.branch).commit_hash))

});

app.get('/api/allBranches', (req, res) => {
  res.send(getAllBranches())

});

app.get('/api/commit/fileTree/:commit', (req, res) => {
  res.send(treeContents(JSON.parse(getObject(req.params.commit).data).tree))
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
    'merge <name>', 
    'merge two branches', 
    (yargs) => {
      return yargs.positional('name', {
        describe: 'branch to merge into current branch',
        type: 'string',
      })
    }, 
    async (argv) => {
      const db = getDb()

    if (getBranch(argv.name) == undefined){

      console.log(chalk.redBright('Branch provided does not exist'))

    } else {

      const currBranch = fs.readFileSync('./.twig/HEAD', 'utf8')
      const currBranchLatestCommit = getBranch(currBranch).commit_hash
      const mergeBranchLatestCommit = getBranch(argv.name).commit_hash

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
            const treeIn = (JSON.parse(getObject(mergeBranchLatestCommit).data).tree)
            const filesToMake = getTreeFiles(treeIn)

            for (const file of filesToMake){
            const content = fs.readFileSync('./.twig/files/' + file[2], 'utf8');
            fs.mkdirSync('./' + file[0], { recursive: true }, (err) => {
              console.log(err)
            });
            fs.writeFileSync('./' + file[0] + file[1], content, 'utf8');

      }
            setParentBranch(mergeBranchLatestCommit, currBranch)
            const BranchDeletion = await confirm({ message: `Would you like to delete branch ${chalk.magenta.bold(argv.name)} after merging?` });
        if (BranchDeletion){

          deleteBranch(argv.name)

        }
            console.log(`Sucessfully merged ${chalk.magenta.bold(argv.name)} into ${chalk.magenta.bold(currBranch)}`)

            // ------------------------------------------------------------------------------------------------------------------------------------------------------
    } else {
            const base = findCommonBase(currBranchLatestCommit, mergeBranchLatestCommit)
            const baseTree = getTreeFilesAndHash((JSON.parse(getObject(base).data).tree))
            const currBranchTree = getTreeFilesAndHash((JSON.parse(getObject(currBranchLatestCommit).data).tree))
            const mergeBranchTree = getTreeFilesAndHash(JSON.parse(getObject(mergeBranchLatestCommit).data).tree) 
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

            console.log(path, (baseHash == currHash && baseHash == mergeHash ? "Unchanged":(baseHash != currHash ? (baseHash != mergeHash ? "Changes in both" : "Current branch ahead") : "Merge branch ahead")));
    

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

              console.log('\nMERGE CONFLICT IN: ' + conflict[0])
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

        insertObject(hash(JSON.stringify(commitinfo)), "commit", JSON.stringify(commitinfo))
        setParentBranch(hash(JSON.stringify(commitinfo)), currBranch)
        const BranchDeletion = await confirm({ message: `Would you like to delete branch ${chalk.magenta.bold(argv.name)} after merging?` });
        if (BranchDeletion){

          deleteBranch(argv.name)

        }
        console.log(`Sucessfully merged ${chalk.magenta.bold(argv.name)} into ${chalk.magenta.bold(currBranch)}`)
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

      const db = getDb()

      const commitTree = JSON.parse(getObjectLike(`${argv.commit}%`).data).tree
      loadCommitToDirectory(commitTree)

      const currentBranch = fs.readFileSync('./.twig/HEAD', 'utf8')

    setParentBranch(getObjectLike(`${argv.commit}%`).hash, currentBranch)
      
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
      const db = getDb()
    
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
  commitList = getBranchCommitHistory(getBranch(currBranch).commit_hash).toReversed()
  fs.writeFileSync('./.twig/REMOTE', "true", 'utf8');
  console.timeEnd('commitList')

}  else {
console.time('commitList')
  commitList = getUnpushedCommitHistory(getBranch(currBranch).commit_hash)
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
    const parent_commit = JSON.parse(getObject(commitList[i].hash).data).parent
    trees = await deltaUpload(getTreeFilesAndHash(JSON.parse(getObject(parent_commit).data).tree), getTreeFilesAndHash(commitList[i].tree), spinner)
  }
  console.timeEnd('PREPARE')
  spinner.text = 'Processing...'
   if (trees.length == 0){
    updateCommitSha('NOT PUSHED', commitList[i].hash)
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
    
    updateCommitSha(commitData.sha, commitList[i].hash)
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
  ).command(
      'ratelim', 
    '', 
    (yargs) => {
    }, 
    async (argv) => {
      const db = getDb()
      /*
       const octokit = new Octokit({ auth: GITHUB_SECRET });
      
         const { data: data } = await octokit.request("GET /rate_limit")
        console.log(data)
      */



async function pullFromRemote() {
  const octokit = new Octokit({ auth: GITHUB_SECRET });
  const db = getDb();

  const OWNER = "anshxlm";
  const REPO = "twigtesting";
  const currBranch = fs.readFileSync("./.twig/HEAD", "utf8").trim();
  const BRANCH = currBranch === "master" ? "main" : currBranch;

  console.log(`Checking for updates on remote branch: ${BRANCH}...`);

  const { data: refData } = await octokit.request("GET /repos/{owner}/{repo}/git/ref/heads/{branch}", {
    owner: OWNER,
    repo: REPO,
    branch: BRANCH
  });
  const remoteCommitSha = refData.object.sha;
    
  const localCommitSha = getBranch(currBranch).commit_hash;

  console.log(localCommitSha)
  console.log(getObject(localCommitSha))
  const processedLocalCommitSha = JSON.parse(getObject(localCommitSha).data).tree


  const { data: commitData } = await octokit.request("GET /repos/{owner}/{repo}/git/commits/{commit_sha}", {
    owner: OWNER,
    repo: REPO,
    commit_sha: remoteCommitSha
  });
  const remoteTreeSha = commitData.tree.sha;


  const { data: treeData } = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=true", {
    owner: OWNER,
    repo: REPO,
    tree_sha: remoteTreeSha
  });

  const remoteFiles = {};
  for (const item of treeData.tree) {
    if (item.type === "blob") {
      remoteFiles[item.path] = item.sha;
    }
  }

  const localFiles = getTreeFilesAndHash(processedLocalCommitSha); 

  // 4. Determine what needs to be downloaded or deleted
  const toDownload = [];
  const toDelete = [];


  for (const [filePath, sha] of Object.entries(remoteFiles)) {
    if (!localFiles[filePath] || localFiles[filePath] !== sha) {
      toDownload.push({ path: filePath, sha: sha });
    }
  }

  // Check for deletions (files present locally but missing in remote tree)
  for (const filePath of Object.keys(localFiles)) {
    if (!remoteFiles[filePath]) {
      toDelete.push(filePath);
    }
  }

  console.log(`Pulling changes: ${toDownload.length} files to update, ${toDelete.length} files to remove.`);

  for (const filePath of toDelete) {
    const fullPath = path.resolve("./", filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`Deleted: ${filePath}`);
    }
  }

  const CONCURRENCY_LIMIT = 25;
  for (let i = 0; i < toDownload.length; i += CONCURRENCY_LIMIT) {
    const chunk = toDownload.slice(i, i + CONCURRENCY_LIMIT);

    await Promise.all(
      chunk.map(async (file) => {
        // Fetch the raw blob data from GitHub
        const { data: blobData } = await octokit.request("GET /repos/{owner}/{repo}/git/blobs/{file_sha}", {
          owner: OWNER,
          repo: REPO,
          file_sha: file.sha
        });

        const fileContent = Buffer.from(blobData.content, "base64");
        const fullPath = path.resolve("./", file.path);

        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        
        fs.writeFileSync(fullPath, fileContent);
        
        // Optional: Save the downloaded blob into your local `.twig/files/` store
        fs.writeFileSync(path.resolve("./.twig/files/", file.sha), fileContent);
        
        console.log(`Updated: ${file.path}`);
      })
    );
  }

  console.log(`Successfully pulled and updated local filesystem to commit ${remoteCommitSha.slice(0, 7)}!`);
}

pullFromRemote()






      }
  ).command(
      'test', 
    '', 
    (yargs) => {
    }, 
    async (argv) => {

      console.log(getObject('ebab941e004b40ab77a4120eb066fd999db9238e').data)
      

    }
  ).help()
  .parse()