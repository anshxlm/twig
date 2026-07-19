
import { Logger } from '../process/logger.js';
import * as database from '../process/database.js'
import chalk from 'chalk';
import fs from 'node:fs'
const logger = new Logger()

export default function listBranches(){
    const currentBranch = fs.readFileSync('./.twig/HEAD', 'utf8')
    const branches = database.getAllBranches()
    for (const branch of branches){
        logger.output(branch.name == currentBranch ? 'Branch ' + chalk.magenta.bold(branch.name + chalk.hex("#ff7b00")(" (HEAD)")) + ' - ' + (branch.commit_hash == null ? '(no latest commit)' :branch.commit_hash.slice(0, 8) + ' (latest commit)'): 'Branch ' + chalk.magenta.bold(branch.name) + ' - ' + (branch.commit_hash == null ? '(no latest commit)' :branch.commit_hash.slice(0, 8) + ' (latest commit)'))
    }
}