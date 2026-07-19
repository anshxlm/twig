import fs from 'node:fs'
import { Logger } from '../process/logger.js';
import * as database from '../process/database.js'
import * as crypto from '../process/crypto.js'
import path from "path";
const logger = new Logger()

import getTreeFilesAndHash from '../util/getTreeFilesAndHash.js'
import comparison from '../util/comparison.js';


export default function compare(c1,c2){
    let currentHash = JSON.parse(database.getObjectLike(`${c2}%`).data).parent
          let first = false;
    
          while (currentHash){
            if (currentHash == database.getObjectLike(`${c1}%`).hash){
              first = true
              comparison(getTreeFilesAndHash(JSON.parse(database.getObjectLike(`${c1}%`).data).tree), getTreeFilesAndHash(JSON.parse(database.getObjectLike(`${c2}%`).data).tree))
            }
            const commit = JSON.parse(database.getObjectLike(currentHash).data);
            currentHash = commit.parent;
          }
          if (!first){
            comparison(getTreeFilesAndHash(JSON.parse(database.getObjectLike(`${c2}%`).data).tree), getTreeFilesAndHash(JSON.parse(database.getObjectLike(`${c1}%`).data).tree))
          }
}