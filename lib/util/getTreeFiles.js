

import * as database from '../process/database.js'

// returns ONLY files of a tree, along with file name and hash ***********************************************************
export default function getTreeFiles(branch, currPath="/", allFiles = []) {
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