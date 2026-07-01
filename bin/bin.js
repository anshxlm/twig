#!/usr/bin/env node
import yargs from 'yargs';
import express from 'express';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import ora from 'ora';
import { input } from '@inquirer/prompts';
import fs, { existsSync, read } from 'node:fs';
import crypto, { randomBytes } from 'node:crypto'
import path from "path";
import Database from 'better-sqlite3';import { create } from 'node:domain';
import { fileURLToPath } from 'url';
import { get } from 'node:https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;
export function getDb() {
    if (!db) {
        db = new Database("./.twig/tree.db");
        db.pragma("journal_mode = WAL");
    }

    return db;
}

function readTree(where) {
  const db = getDb();

  const insertObject = db.prepare(`
    INSERT INTO objects (hash, type, data)
    VALUES (?, ?, ?)
`);

    const entries = [];

    const files = fs.readdirSync(where, {
        withFileTypes: true
    });

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
const files = fs.readdirSync(where, {
  recursive: true,
  withFileTypes:true
},
 (err) => {
  }
);

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
          console.log()
        spinner.start()
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

        const initTree = generateTree('./testFolder')
        
        fs.mkdir('./.twig/files', (err) => {
           
        });

        for (const file of initTree){

        const content = fs.readFileSync(file, 'utf8');
        fs.writeFileSync('./.twig/files/' + hash(content), content, 'utf8');
  
        //console.log(`file ${file} saved to ${hash}`);

        }
        readTree('./testFolder')

        const commitRoot = readTree('./testFolder')

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

      const initTree = generateTree('./testFolder')

        for (const file of initTree){
        
        const content = fs.readFileSync(file, 'utf8');

        if (fs.existsSync('./.twig/files/' + hash(content))) {
        } else {
        
        fs.writeFileSync('./.twig/files/' + hash(content), content, 'utf8');
        }
        }
  
         const commitRoot = readTree('./testFolder')

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


        const commitinfo = {
        tree: commitRoot,
        message: msg,
        parent:getParent.get(parentBranch).commit_hash,
        when: Date.now()
        };

        insertObject.run(hash(JSON.stringify(commitinfo)), "commit", JSON.stringify(commitinfo))
        setParentBranch.run(hash(JSON.stringify(commitinfo)), parentBranch)
        // fs.writeFileSync('./.twig/HEAD', hash(JSON.stringify(commitinfo)), 'utf8');

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

    const parentBranch = fs.readFileSync('./.twig/HEAD', 'utf8');
        const getParent = db.prepare(`
    SELECT commit_hash FROM branches
    WHERE name = ?
    `);

    let hash = getParent.get(parentBranch).commit_hash

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

  console.log('\nRoot')
  consoleTree(JSON.parse(getObject.get(getParent.get(parentBranch).commit_hash).data).tree)

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
      })
    }, 
    (argv) => {
      const db = getDb();

      const exists = db.prepare(`
    SELECT * FROM branches
    WHERE name = ?
    `);

    if (exists.get(argv.name) == undefined){
      console.log('Branch does not exist')
    } else {
      fs.writeFileSync('./.twig/HEAD', argv.name, 'utf8');
      console.log("Current branch: " + chalk.magenta(argv.name))
    }
      

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

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/branches/:branch', (req, res) => {
  res.send(getBranchCommitHistory(getBranchCommits.get(req.params.branch).commit_hash))

});

app.get('/api/allBranches', (req, res) => {
  res.send(getBranches.all())

});

app.get('/api/commits', (req, res) => {
  res.send(getCommits.all())
});

app.get('/branch/:branch', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
});


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
      

      }
  )
  .help()
  .parse()