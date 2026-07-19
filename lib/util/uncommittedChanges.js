import fs from 'node:fs'
import { Logger } from '../process/logger.js';
import * as database from '../process/database.js'
import * as crypto from '../process/crypto.js'
import path from "path";
const logger = new Logger()
import getDirectoryFiles from './getDirectoryFiles.js';
import getTreeFiles from './getTreeFiles.js';

export default function uncommittedChanges(treeIn){
  logger.log("engine", "checking for uncommitted changes")
  const currHead = fs.readFileSync('./.twig/HEAD', 'utf8');
      let curr_branch_commit
      if (database.getBranch(currHead) !== undefined){
      curr_branch_commit = database.getBranch(currHead).commit_hash
      } else {
        curr_branch_commit = currHead
      }
      const cur_treeIn = (JSON.parse(database.getObject(curr_branch_commit).data).tree)

      const curr_files = getTreeFiles(cur_treeIn)

      const currRead = getDirectoryFiles('./')
      const remote_comparison_files = []
      const local_comparison_files = []
      for (const file of curr_files){
        remote_comparison_files.push([path.join(file[0].slice(1, file[0].length), file[1]), file[2]])
      }

      for (const file of currRead){
        local_comparison_files.push([file, crypto.hash(fs.readFileSync(file, 'utf8'))])
      }

      if (JSON.stringify(remote_comparison_files.sort()) !== JSON.stringify(local_comparison_files.sort())){
        return true
      } else {
        return false
      }
}