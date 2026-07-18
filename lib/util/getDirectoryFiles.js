import fs from 'node:fs'
import { Logger } from '../process/logger.js'
import * as database from '../process/database.js'
import * as crypto from '../process/crypto.js'
import path from "path";
const logger = new Logger()

// returns all files in the current workspace
export default function getDirectoryFiles(dir, files = []) {

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
