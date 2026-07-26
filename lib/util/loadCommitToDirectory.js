import getTreeFiles from "./getTreeFiles.js";
import fs from "fs-extra";
import path from "path";
import * as crypto from '../process/crypto.js'
import * as database from '../process/database.js'

export default function loadCommitToDirectory(treeIn){
   const folderPath = './';
   const initalfiles = fs.readdirSync(folderPath)
  const files = initalfiles.filter(item => item.startsWith('.twig') !== true)

for (const file of files) {
  const curPath = path.join(folderPath, file);
  try {
    fs.rmSync(curPath, { recursive: true, force: true });
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EBUSY') {
      if (fs.statSync(curPath).isFile()) {
        fs.writeFileSync(curPath, '');
      }
    } {
      console.error(err.message);
    }
  }
}
      const filesToMake = getTreeFiles(treeIn)

      for (const file of filesToMake){
      const content = fs.readFileSync('./.twig/files/' + file[2], 'utf8');
      fs.mkdirSync('./' + file[0], { recursive: true }, (err) => {
        logger.error("engine", err)
      });
      fs.writeFileSync('./' + file[0] + file[1], content, 'utf8');

      }


}