#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import ora from 'ora';
import { input } from '@inquirer/prompts';
import fs, { existsSync, read } from 'node:fs';
import crypto, { randomBytes } from 'node:crypto'
import path from "path";
import Database from 'better-sqlite3';;

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
        const filePath = './.twig/INIT';
        if (existsSync(filePath)){
          console.log()
          spinner.fail('twig is already initialized here!')
        } 
        else {


          spinner.stop()
          console.log()
        const answer = await input({ message: 'what is your project name' });
        spinner.start()
        fs.writeFileSync(filePath, answer, 'utf-8');
        const db = getDb();
        db.exec(`
  CREATE TABLE IF NOT EXISTS objects (
    hash TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL
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

        const commitinfo = {
        tree: commitRoot,
        message: "Initial Commit",
        parent:null,
        when: Date.now()
        };
        fs.writeFileSync('./.twig/HEAD', hash(JSON.stringify(commitinfo)), 'utf8');
        insertObject.run(hash(JSON.stringify(commitinfo)), "commit", JSON.stringify(commitinfo))
        spinner.succeed(chalk.green(answer) + " initialized")

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
        
        const parent = fs.readFileSync('./.twig/HEAD', 'utf8');

        const commitinfo = {
        tree: commitRoot,
        message: msg,
        parent:parent,
        when: Date.now()
        };

        insertObject.run(hash(JSON.stringify(commitinfo)), "commit", JSON.stringify(commitinfo))
        fs.writeFileSync('./.twig/HEAD', hash(JSON.stringify(commitinfo)), 'utf8');

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
    'history', 
    'commit history', 
    () => {}, 
    (argv) => {
      const db = getDb();

      const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash = ?
    `);

    let hash = fs.readFileSync("./.twig/HEAD", "utf8");

   const historyArr = []; 

  while (hash) {

    const commit = JSON.parse(getObject.get(hash).data);

    historyArr.push(commit.message)

    hash = commit.parent;
} 
  console.log()

  for (const [index, msg] of historyArr.toReversed().entries()){
    if (index == 0){
      console.log('--> ' + msg)
    }
    else {
    console.log(msg)
    }
  }

    }
  )
  .help()
  .parse()