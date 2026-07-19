import { Logger } from '../process/logger.js';
import * as database from '../process/database.js'
import chalk from 'chalk';
const logger = new Logger()


export default function twigLog(hash){
    const historyArr = []; 
    
      while (hash) {
        const commit = JSON.parse(database.getObjectLike(hash).data);
    
        historyArr.push({hash:hash, message:commit.message})
    
        hash = commit.parent;
    } 
    
      for (const [index, msg] of historyArr.entries()){
        if (index == 0){
          logger.output(msg.message + chalk.hex('#ff7b00').bold(' (latest) ') + chalk.yellow(msg.hash.slice(0, 8)))
        }
        else {
        logger.output(msg.message  + ' ' + chalk.yellow(msg.hash.slice(0, 8)))
        }
      }
}