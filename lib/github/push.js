import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs from "fs-extra";
import os from "os";
import path from "path";
import * as crypto from '../process/crypto.js'
import getTreeFilesAndHash from "../util/getTreeFilesAndHash.js";
import { input } from "@inquirer/prompts";
import { Readable } from 'node:stream';
import filesIntoDB from "../util/filesIntoDb.js";
import envPaths from 'env-paths';
import * as database from '../process/database.js'

const paths = envPaths('twigvcs', {suffix:''});


let remote
      const remote_read = fs.readFileSync('./.twig/REMOTE', 'utf8')
      if (!remote_read){
        logger.error("engine", "cannot find remote.")
        process.exit()
      } else {
        remote = remote_read
      }

const token = fs.readFileSync(path.join(paths.data, 'GITHUB_TOKEN' ), 'utf8')
const dir = path.join('./.twig/',"twig-engine");


async function writeBlob(buffer) {

    return await git.writeBlob({
        fs,
        gitdir:dir,
        dir,
        blob: buffer
    });

}

async function writeTree(treeHash) {

    const tree = JSON.parse(
        database.getObject(treeHash).data
    );

    const entries = [];

    for (const entry of tree) {

        if (entry.type === "blob") {

            const oid = await writeBlob(
                fs.readFileSync(`./.twig/files/${entry.hash}`)
            );

            entries.push({
                mode: "100644",
                path: entry.name,
                oid,
                type: "blob"
            });

        } else {

            const oid = await writeTree(entry.hash);

            entries.push({
                mode: "040000",
                path: entry.name,
                oid,
                type: "tree"
            });

        }

    }

    return await git.writeTree({
        fs,
        dir,
        gitdir:dir,
        tree: entries
    });

}

async function writeCommit(commitHash, parentGitOid) {

    const commit = JSON.parse(
        database.getObject(commitHash).data
    );

    const tree = await writeTree(commit.tree);

    return await git.writeCommit({

        fs,
        dir,
        gitdir:dir,

        commit: {

            tree,

            parent: [
                parentGitOid
            ],

            author: {

                name: "anshxlm",

                email: "gamerbob9393@gmail.com",

                timestamp: Math.floor(commit.when / 1000),

                timezoneOffset: 0

            },

            committer: {

                name: "anshxlm",

                email: "gamerbob9393@gmail.com",

                timestamp: Math.floor(commit.when / 1000),

                timezoneOffset: 0

            },

            message: commit.message

        }

    });

}

export default async function push(){


    await git.clone({
    fs,
    http,

    dir,
    gitdir:dir,

    url: remote,

    ref: "main",
    
    noCheckout:true,

    singleBranch: true,

    onAuth: () => ({
        username: token
    })
    })




let parent = fs.readFileSync('./.twig/GITHUB', 'utf8');






const currBranch = fs.readFileSync('./.twig/HEAD', 'utf8')
    let commitsToPush = []
    let commit = database.getBranch(currBranch).commit_hash
    while (commit){
        if (database.getObject(commit).commit_sha){
        break
    } else {
        commitsToPush.push(commit)
        commit = JSON.parse(database.getObject(commit).data).parent
    }
    }

    console.log(commitsToPush)


for (const twigCommit of commitsToPush.toReversed()) {

    const gitCommit = await writeCommit(
        twigCommit,
        parent
    );

    database.updateCommitSha(twigCommit, gitCommit)

    parent = gitCommit;

}


await git.writeRef({
    fs,
    dir,
    gitdir:dir,
    ref: "refs/heads/main",

    value: parent,

    force: true
});

fs.writeFileSync('./.twig/GITHUB', parent, 'utf8')

await git.push({

    fs,
    http,
    gitdir:dir,
    dir,

    remote: "origin",

    ref: "main",

    onAuth: () => ({
        username: token,
        password: ""
    })

});

fs.rmSync(dir, {force:true, recursive:true})



}