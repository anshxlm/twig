import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs from "fs-extra";
import os from "os";
import path from "path";
import * as crypto from '../process/crypto.js'
import { input } from "@inquirer/prompts";
import { Readable } from 'node:stream';
import envPaths from 'env-paths';
import * as database from '../process/database.js'
import { Logger } from "../process/logger.js";

import objectToTrees from "../util/objectToTrees.js";
import flatTreeToDirectory from "../util/flatTreeToDirectory.js";
import applyDiff from "../util/applyDiff.js";
import loadCommitToDirectory from "../util/loadCommitToDirectory.js";

const paths = envPaths('twigvcs', {suffix:''});
const logger = new Logger()



export default async function pull(){

      let lastToLoad = true

      let remote
      const remote_read = fs.readFileSync('./.twig/REMOTE', 'utf8')
      if (!remote_read){
        logger.error("engine", "cannot find remote.")
        process.exit()
      } else {
        remote = remote_read
      }

      const dir = path.join('./.twig/',"twig-engine");
      const token = fs.readFileSync(path.join(paths.data, 'GITHUB_TOKEN' ), 'utf8')

      await git.clone({
          fs,
          http,
      
          dir,
      
          url: remote,
      
          
          noCheckout:true,


          gitdir:dir,
      
          onAuth: () => ({
              username: token
          })
          })



const branches = await git.listBranches({
    fs,
    gitdir: dir,
    remote: "origin"
});

if (branches.length == 0){
  logger.log("client", "repository is empty")
  fs.rmSync(dir, {force:true, recursive:true})
  process.exit()

} else {
  console.log(branches)
}

for (const branch of branches) {
  if (branch == "HEAD") continue;
  
  const currBranch = fs.readFileSync('./.twig/HEAD', 'utf8')

  const branchName = branch == "main" ? "master":branch

  const exists = database.getBranch(branchName)

  if (!exists){
    database.newBranch(branchName, database.getBranch(currBranch).commit_hash)
  }


    let log
    try{
      log = await git.log({
          fs,
          dir,
          gitdir:dir,
          ref: `origin/${branch}`,
      });
    } catch (err){
      if (err.code == "NotFoundError"){
        logger.warning("engine", 'Github repo is empty SRC:' + branchName)
        fs.rmSync(dir, {force:true, recursive:true})
        process.exit()
      }
    }

      let lastPulled = null
      let commit = database.getBranch(branchName).commit_hash
      while (commit){
        if (database.getObject(commit).commit_sha){
        lastPulled = database.getObject(commit).commit_sha
        break
        } else {
        commit = JSON.parse(database.getObject(commit).data).parent
        }
      }



      let LogChunk

      if (lastPulled){
        const index = log.toReversed().findIndex(item => item.oid == lastPulled)
        LogChunk = log.toReversed().slice(index + 1)
      } else {
        LogChunk = log.toReversed()
      }

      if (LogChunk.length == 0){
        lastToLoad = false
      }

      for (const commit of LogChunk){
      
      const commitChanges = []
      
      if (commit.commit.parent && commit.commit.parent.length == 1){    
      
      await git.walk({
        fs,
        dir,
        gitdir:dir,
        trees: [
          git.TREE({ ref: commit.commit.parent[0] }),
          git.TREE({ ref: commit.oid })
        ],
        map: async (filepath, [A, B]) => {
      if (filepath !== '.'){
          if (A === null) {
          commitChanges.push({
              type:"ADD",
              path:filepath,
              blob: await B.content()
          })
      }
      
      else if (B === null) {
          commitChanges.push({
              type: "DELETE",
              path: filepath
          })
      }
      
      else if (A && B) {
          if (await A.oid() !== await B.oid()) {
              commitChanges.push({
              type: "MODIFY",
              path: filepath,
              blob: await B.content()
          },)
          }
      }
      
        }
      }
      });

      console.log(commitChanges)
      const lastCommit = applyDiff(JSON.parse(database.getObject(database.getBranch(branchName).commit_hash).data).tree, commitChanges, commit.commit.message, commit.commit.committer.timestamp, commit.oid)
      database.setParentBranch(lastCommit[0], branchName)

        if (LogChunk.indexOf(commit) + 1 == LogChunk.length){
        
        fs.writeFileSync('./.twig/GITHUB', lastCommit[1], 'utf8')
        loadCommitToDirectory(JSON.parse(database.getObject(lastCommit[0]).data).tree)
      
      }
      
      }  else {

async function importTree(treeOid, prefix = "", changes = []) {
    const tree = await git.readTree({
        fs,
        dir,
        gitdir:dir,
        oid: treeOid
    });

    for (const entry of tree.tree) {

        if (entry.type === "tree") {

            await importTree(
                entry.oid,
                prefix + entry.path + "/",
                changes
            );

        } else {

            const blob = await git.readBlob({
                fs,
                dir,
                gitdir:dir,
                oid: entry.oid
            });

            const buffer = Buffer.from(blob.blob);
             changes.push({
              type:"ADD",
              path:entry.path,
              blob: buffer.toString("utf8")
          })

        }

    }

    return changes

}


      const changes = await importTree(commit.commit.tree)

      console.log(changes)
      const lastCommit = applyDiff(null, changes, commit.commit.message, commit.commit.committer.timestamp, commit.oid)
      database.setParentBranch(lastCommit[0], branchName)
      
      if (LogChunk.length == 1){
        fs.writeFileSync('./.twig/GITHUB', lastCommit[1], 'utf8')
        loadCommitToDirectory(JSON.parse(database.getObject(lastCommit[0]).data).tree)
      }

      }


      }
    }

      if (lastToLoad){
        const currBranch = fs.readFileSync('./.twig/HEAD', 'utf8')
        const commit = database.getBranch(currBranch).commit_hash
        loadCommitToDirectory(JSON.parse(database.getObject(commit).data).tree)
      }

      fs.rmSync(dir, {force:true, recursive:true})


}