
import fs from "fs-extra";
import path from "path";
import * as crypto from '../process/crypto.js'
import * as database from '../process/database.js'
import { Logger } from "../process/logger.js";
import getTreeFilesAndHash from "../util/getTreeFilesAndHash.js";
import flatTreeToDirectory from "./flatTreeToDirectory.js";
import objectToTrees from "./objectToTrees.js";
import loadCommitToDirectory from "./loadCommitToDirectory.js";

export default function applyDiff(parentTreeHash, diff, message, timestamp, oid) {
    let tree
    if (!parentTreeHash){tree = {}} else {
    tree = getTreeFilesAndHash(parentTreeHash)
    }

    for (const change of diff) {

        if (change.type === "DELETE") {

            delete tree[change.path];

        } else {
          if (change.blob !==undefined){
            console.log(change.blob)
            const blobHash = crypto.hash(change.blob);

            fs.writeFileSync('./.twig/files/'+ blobHash, change.blob)

            tree[change.path] = blobHash;
          }

        }

    }

    const currBranch = fs.readFileSync('./.twig/HEAD', 'utf8')
    const map = flatTreeToDirectory(tree)
    console.log(map)
    const lastTree = objectToTrees(map)
    const commitinfo = {
            tree: lastTree,
            message: message.replace("\n",""),
            parent:database.getBranch(currBranch).commit_hash,
            when: timestamp
            };
    
            database.insertObject(
            crypto.hash(JSON.stringify(commitinfo)),
            "commit",
            JSON.stringify(commitinfo), 
            oid
            );

    return [crypto.hash(JSON.stringify(commitinfo)), oid]
}