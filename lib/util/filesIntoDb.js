import fs from 'node:fs'
import { Logger } from '../process/logger.js'
import * as database from '../process/database.js'
import * as crypto from '../process/crypto.js'
import path from "path";

const logger = new Logger()

// maps the file system into trees and then inserts them into database
export default function filesIntoDB(where, blobHashes) {

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

    const treeHash = crypto.hash(JSON.stringify(entries));

    database.insertObject(treeHash, "tree", JSON.stringify(entries))

    return treeHash;
}