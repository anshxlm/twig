import fs, { existsSync, read } from 'node:fs';
import path from "path";

import Database from 'better-sqlite3';




import crypto from 'node:crypto';

function hash(data) {
    return crypto
        .createHash("sha1")
        .update(data)
        .digest("hex");
}


const db = new Database('./.chimp/tree.db');
db.pragma('journal_mode = WAL');



db.exec(`
  CREATE TABLE IF NOT EXISTS objects (
    hash TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL
);
`);

const insertObject = db.prepare(`
    INSERT INTO objects (hash, type, data)
    VALUES (?, ?, ?)
`);



//const rows = db.prepare('SELECT * FROM objects').all();

// Display the results
//console.log(rows);



function generateTree( where ){

const dirs = []

const files = fs.readdirSync(where, {
  recursive: true,
  withFileTypes:true
},
 (err) => {
    console.log(err)
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

/*
function readTree( where ){

  const insertObject = db.prepare(`
    INSERT INTO objects (hash, type, data)
    VALUES (?, ?, ?)
`);

const dirs = []

const files = fs.readdirSync(where, {
  withFileTypes:true
},
 (err) => {
    console.log(err)
  }
);

for (const currFile of files){
  const fullPath = path.join(where, currFile.name);

if (currFile.isDirectory()){
    const subtree = readTree(fullPath);

    dirs.push({
                name: currFile.name,
                type: "tree",
                data: subtree
            })

    //insertObject.run(currFile.name, "tree", JSON.stringify(subtree))


} else {
     dirs.push({
                name: currFile.name,
                type: "blob",
                hash: "yoohoooooooo"
            })
      //insertObject.run(currFile.name, "blob", "yoohoo")
}

}
return dirs
}
*/

function readTree(where) {

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

            const blobHash = hash(fullPath);

            entries.push({
                name: currFile.name,
                type: "blob",
                hash: blobHash
            });

        }
    }

    const treeHash = hash(JSON.stringify(entries));

    insertObject.run(
        treeHash,
        "tree",
        JSON.stringify(entries)
    );

    return treeHash;
}

const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash = ?
`);

function consoleTree(treeHash, indent = "") {

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


const allFiles = new Set([
    ...Object.keys(tree1),
    ...Object.keys(tree2)
]);

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

    else {
        console.log("UNCHANGED:", file);
    }
}
}



comparison(compareTree(JSON.parse(getObject.get("60ca1ea3df56a63e629430c089a53c4853b267ad").data).tree), compareTree(JSON.parse(getObject.get("5de705ab67fa93a67d1d7f421fe1e31a6ee61b6b").data).tree))




//const rootHash = readTree('./testFolder');

//const rootTree = JSON.parse(getObject.get(rootHash).data);

//console.log(compareTree("f74373afdb3dea97144da1136fd7025dd9eb6ac9"))
//console.log(compareTree("c841d48cf9eafad8722bd79b99c75a1ca801f49d"))