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
import { Logger } from "../process/logger.js";

const paths = envPaths('twigvcs', {suffix:''});
const logger = new Logger()

let remote
try{
      remote = fs.readFileSync('./.twig/REMOTE', 'utf8')
    } catch (err){}

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
    let parents
    if (!parentGitOid){
        parents = []
    } else if (parentGitOid.length == 2) {
        parents = parentGitOid
    } else {
        parents = [parentGitOid]
    }

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

            parent: parents,

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

    if (!remote){
        logger.warning("client", "remote not set")
        process.exit()
    }

const refs = await git.listServerRefs({
    http,
    url: remote,
    onAuth: () => ({
        username: token,
    })
});

if (refs.length == 0){
    console.log("empty")

    await git.init({
    fs,
    dir,
    gitdir:dir,
    defaultBranch: "main"
});


await git.addRemote({
    fs,
    dir,
    gitdir:dir,
    remote: "origin",
    url: remote
});


} else {

    await git.clone({
    fs,
    http,

    dir,
    gitdir:dir,

    url: remote,
    
    noCheckout:true,

    onAuth: () => ({
        username: token
    })
    })

}

let branches = database.getAllBranches();
let allBranches = branches.filter(item => item.name !== "master");
allBranches.push(database.getBranch("master"))


for (const twigBranch of allBranches) {    
    console.log(twigBranch.name)

    const twigBranchName = twigBranch.name;

    const gitBranch = twigBranchName === "master" ? "main" : twigBranchName;

    let parent = null;

    try {
        parent = await git.resolveRef({
            fs,
            gitdir: dir,
            ref: `refs/heads/${gitBranch}`
        });
    } catch {
        
    }

    const commitsToPush = [];

    let commit = twigBranch.commit_hash;

    while (commit) {

        const object = database.getObject(commit);

        if (object.commit_sha) break;

        commitsToPush.push(commit);

        commit = JSON.parse(object.data).parent;
    }

    if (commitsToPush.length === 0)
        continue;


        if (!parent && commitsToPush.length > 0) {

    const firstCommit = JSON.parse(database.getObject(commitsToPush.at(-1)).data);

    if (firstCommit.parent) {
        parent = database.getObject(firstCommit.parent).commit_sha;
    }
}

    for (const twigCommit of commitsToPush.toReversed()) {

        const data = JSON.parse(database.getObject(twigCommit).data)

        if (data.mergeParent){
            const mergeParentSha = database.getObject(data.mergeParent).commit_sha
            console.log(mergeParentSha)
            parent = [parent, mergeParentSha]
        }

        const gitCommit = await writeCommit(
            twigCommit,
            parent
        );

        database.updateCommitSha(
            twigCommit,
            gitCommit
        );

        parent = gitCommit;
    }


    await git.writeRef({
        fs,
        gitdir: dir,
        ref: `refs/heads/${gitBranch}`,
        value: parent,
        force: true
    });

    await git.push({
        fs,
        http,
        gitdir: dir,
        remote: "origin",
        ref: gitBranch,
        onAuth: () => ({
            username: token
        })
    });

    console.log(`Pushed ${twigBranchName}`);
}

fs.rmSync(dir, {force:true, recursive:true})


}