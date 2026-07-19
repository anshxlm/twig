import fs from 'node:fs'
import { Logger } from '../process/logger.js';
import * as database from '../process/database.js'
import * as crypto from '../process/crypto.js'
import chalk from 'chalk';
import path from "path";
import { confirm } from '@inquirer/prompts';
const logger = new Logger()

export default async function branch(argv){
        
    if (argv.name) {

        logger.log('engine', 'using branch creation')
          
          const parentBranch = fs.readFileSync('./.twig/HEAD', 'utf8');
          let undoDeletion = false;
    try {
        database.newBranch(argv.name, database.getBranch(parentBranch).commit_hash)
    } catch (error){
      if (error.message == "UNIQUE constraint failed: branches.name"){
        if (database.getBranch(argv.name, true).deleted){
          undoDeletion = true
        } else {
          logger.error('engine', "branch already exists")
          process.exit()
        }
      } else throw error
    }
        if (undoDeletion){
          database.undoDeleteBranch(argv.name)
          database.setParentBranch(database.getBranch(parentBranch).commit_hash, argv.name)
        }
    
        logger.success("client", `new branch ${chalk.magenta.bold(argv.name)} created`)
        const checkout = await confirm({message:`checkout ${chalk.magenta.bold(argv.name)}`, default:false})
        if (checkout){
          if (!uncommittedChanges()){
          fs.writeFileSync('./.twig/HEAD',argv.name, 'utf8');
          logger.success("client", "Current HEAD: Branch " + chalk.magenta.bold(argv.name))
          } else {
             logger.error("engine", "failed to checkout new branch because there are uncomitted changes in your current working directory.")
          }
        }
    
          }

    if (argv.remove){
        logger.log('engine', '--rm flag: using branch deletion')
        for (const branch of argv.rm){
        logger.warning('client', `are you sure you want to delete branch ${chalk.magenta.bold(branch)}?`)
          const confirmation = await confirm({message:`confirm`})
          if (confirmation){
            database.deleteBranch(branch)
            logger.success('client', "branch deleted")
          }
        }
    
        } 
    
}