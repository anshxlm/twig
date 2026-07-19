import { Logger } from '../process/logger.js';
const logger = new Logger()

// compares sets of files (from getTreeFilesAndHash) to see what changes.
export default function comparison(tree1, tree2){

const allFiles = new Set([...Object.keys(tree1), ...Object.keys(tree2)]);

for (const file of allFiles) {

    if (!(file in tree1)) {
        logger.output("ADDED: " + file);
    }

    else if (!(file in tree2)) {
        logger.output("DELETED: " + file);
    }

    else if (tree1[file] !== tree2[file]) {
        logger.output("MODIFIED: " + file);
    }
}
}