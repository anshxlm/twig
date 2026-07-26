
import * as crypto from '../process/crypto.js'
import * as database from '../process/database.js'


export default function objectToTrees(node) {

    const entries = [];

    for (const [name, value] of Object.entries(node)) {

        if (typeof value === "string") {

            entries.push({
                name,
                type: "blob",
                hash: value
            });

        } else {

            const treeHash = objectToTrees(value);

            entries.push({
                name,
                type: "tree",
                hash: treeHash
            });

        }

    }

    entries.sort((a,b)=>a.name.localeCompare(b.name));

    const treeHash = crypto.hash(JSON.stringify(entries));

    database.insertObject(
        treeHash,
        "tree",
        JSON.stringify(entries)
    );

    return treeHash;
}