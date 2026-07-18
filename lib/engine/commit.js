import fs from 'node:fs'
import { Logger } from '../process/logger.js';
import * as database from '../process/database.js'
import * as crypto from '../process/crypto.js'
import path from "path";
const logger = new Logger()
//---------------------------------------------------------------
import { randomUUID } from 'node:crypto'
import { input, password, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import os from "os";
//---------------------------------------------------------------
import getDirectoryFiles from '../util/getDirectoryFiles.js';
import filesIntoDB from '../util/filesIntoDb.js';

process.env.UV_THREADPOOL_SIZE = String(Math.max(16, os.cpus().length));


export default async function commit(argv){

let db
        try {
            db = database.getDb()
        } catch (err){
            if (err.message = "Cannot open database because the directory does not exist"){
                logger.error("engine", "twig is not initialized here")
                process.exit()
            } else {
                throw err
            }
        }

        let msg = argv.m
        if (!argv.m){
            try {
             msg = await input({ message: 'what is your commit message? (CTRL C to cancel)', required:true,  validate: (value) => {
                if (value && value.toString().trim() !== '' && value !== '0' && value !== 'false') {
                    return true;
            }
                return 'Please provide a input';
            }});
            } catch (error){
                if (error.name == "ExitPromptError"){
                    logger.log("client", "commit cancelled")
                    process.exit(0)
                } else {
                    throw error
            }
            }
        }

        logger.log("client", 'committing with message: '+ chalk.bold(msg))

        const spinner = ora('Generating tree...').start()

        const blobHashes = new Map();

        spinner.text = "Hashing files...";

        console.time(logger.returnLog("engine", "done. commit time"));

        const initialFiles = getDirectoryFiles("./");

        const files = initialFiles.filter(file =>
        !file.includes("node_modules") &&
        !file.includes(".twig")
        );

        const CONCURRENCY_LIMIT = 70;

        for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {

        const chunk = files.slice(i, i + CONCURRENCY_LIMIT);


        spinner.text = logger.returnLog("engine", `hashing ${Math.min(i + CONCURRENCY_LIMIT, files.length)}/${files.length}`);

        await Promise.all(
        chunk.map(async (file) => {

        const blobHash = await crypto.hashFileStream(file);

        blobHashes.set(
        path.resolve(file),
        blobHash
        );

        const blobPath = `./.twig/files/${blobHash}`;

        if (!fs.existsSync(blobPath)) {
        await fs.promises.copyFile(file, blobPath);
        }
        })
        );
        }
        console.timeEnd(logger.returnLog("engine", "done. commit time"));

        const parentBranch = fs.readFileSync('./.twig/HEAD', 'utf8');

        let parent
        if (database.getBranch(parentBranch) == undefined){
        parent = parentBranch
        } else {
        parent = database.getBranch(parentBranch).commit_hash
        }

        const transaction = db.transaction(() => {

        const commitRoot = filesIntoDB("./", blobHashes);

        const commitinfo = {
        tree: commitRoot,
        message: msg,
        parent:parent,
        when: Date.now()
        };

        database.insertObject(
        crypto.hash(JSON.stringify(commitinfo)),
        "commit",
        JSON.stringify(commitinfo)
        );


        if (database.getBranch(parentBranch) == undefined){
        fs.writeFileSync('./.twig/HEAD', crypto.hash(JSON.stringify(commitinfo)), 'utf8');
        } else {
        database.setParentBranch(crypto.hash(JSON.stringify(commitinfo)), parentBranch)
        }

        });

        transaction();

        spinner.succeed(logger.returnSuccess(`client`, `processed ${files.length} files successfully.`))


}