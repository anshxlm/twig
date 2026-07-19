import * as database from '../process/database.js'
import path from "path";

// returns ONLY files of a tree as well, but in a specific format {path:hash}
export default function getTreeFilesAndHash(treeHash, path="", files ={}) {  

    const treeIn = JSON.parse(database.getObjectLike(treeHash).data)


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