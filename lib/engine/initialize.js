import fs from 'node:fs'
import { Logger } from '../process/logger.js';
import * as database from '../process/database.js'
import path from "path";
import { randomUUID } from 'node:crypto'

const logger = new Logger()

export default function initialize(){

    if (fs.existsSync('./.twig')){
        logger.warning("client", "twig is already initialized here!")
        process.exit()
    } 

    else {

        logger.log("engine", "initializing")

        fs.mkdirSync('./.twig/')
        fs.writeFileSync('./.twig/CONFIG', 'null\nWARNING: DO NOT EDIT THIS ID. DOING SO WILL FATALLY AFFECT REMOTE' + '\n' + randomUUID() + '\nfalse\nhttps://twig-cli.vercel.app', 'utf8');
        fs.writeFileSync('./.twig/REMOTE', '', 'utf8');
        fs.writeFileSync('./.twig/GITHUB', '', 'utf8');

        const db = database.getDb();

        db.exec(`
        CREATE TABLE IF NOT EXISTS objects (
        hash TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        commit_sha TEXT NULL
        );
        `);

        db.exec(`
        CREATE TABLE IF NOT EXISTS branches (
        name TEXT PRIMARY KEY,
        commit_hash TEXT NULL,
        deleted BOOLEAN DEFAULT false
        );
        `);

        fs.mkdirSync('./.twig/files');

        fs.writeFileSync('./.twig/HEAD', "master", 'utf8');

        database.newBranch("master", null)

        logger.success("client", "twig initialized")

    }


}
