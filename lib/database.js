
import Database from 'better-sqlite3';
import { Logger } from './logger.js';
let db;
export function getDb() {
  if (!db) {
      db = new Database("./.twig/tree.db");
      db.pragma("journal_mode = WAL");
  }

  return db;
}
db = getDb()

export function insertObject(hash,type,data){
  try {
    const db = getDb()
  } catch (err){
    if (err.message = "Cannot open database because the directory does not exist"){
      logger.error("engine", "twig is not initialized here")
    } else {
      throw err
    }
  }
    const insertObject = db.prepare(`
        INSERT OR IGNORE INTO objects(hash,type,data)
        VALUES(?,?,?)
    `);
    return insertObject.run(hash,type,data)

}

export function getObject(hash){
  try {
    const db = getDb()
  } catch (err){
    if (err.message = "Cannot open database because the directory does not exist"){
      logger.error("engine", "twig is not initialized here")
    } else {
      throw err
    }
  }
  const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash = ?
    `)
  return getObject.get(hash)
}

export function getObjectLike(hash){
  try {
    const db = getDb()
  } catch (err){
    if (err.message = "Cannot open database because the directory does not exist"){
      logger.error("engine", "twig is not initialized here")
    } else {
      throw err
    }
  }
  const getObject = db.prepare(`
    SELECT * FROM objects
    WHERE hash LIKE ?
    `);
  return getObject.get(hash)
}

export function setParentBranch(hash, branchName){
  try {
    const db = getDb()
  } catch (err){
    if (err.message = "Cannot open database because the directory does not exist"){
      logger.error("engine", "twig is not initialized here")
    } else {
      throw err
    }
  }
  const setParentBranch = db.prepare(`
    UPDATE branches
    SET commit_hash = ?
    WHERE name = ?;
    `);
  return setParentBranch.run(hash,branchName)

}

export function getBranch(name, deleted=false){
  try {
    const db = getDb()
  } catch (err){
    if (err.message = "Cannot open database because the directory does not exist"){
      logger.error("engine", "twig is not initialized here")
    } else {
      throw err
    }
  }
  if (!deleted){
  const getParent = db.prepare(`
    SELECT * FROM branches
    WHERE name = ? AND deleted = false;
    `);
  return getParent.get(name)
  } else {
     const getParent = db.prepare(`
    SELECT * FROM branches
    WHERE name = ?;
    `);
  return getParent.get(name)
  }

}

export function newBranch(name, commit_hash){
  try {
    const db = getDb()
  } catch (err){
    if (err.message = "Cannot open database because the directory does not exist"){
      logger.error("engine", "twig is not initialized here")
    } else {
      throw err
    }
  }
  const newBranch = db.prepare(`
          INSERT INTO branches (name, commit_hash)
          VALUES (?, ?)
          `);
  return newBranch.run(name, commit_hash)
}

export function getAllBranches(){
  try {
    const db = getDb()
  } catch (err){
    if (err.message = "Cannot open database because the directory does not exist"){
      logger.error("engine", "twig is not initialized here")
    } else {
      throw err
    }
  }
  const getBranches = db.prepare(`
        SELECT * FROM branches
        WHERE deleted = false;
        `)
  return getBranches.all()

}

export function deleteBranch(name){
  try {
    const db = getDb()
  } catch (err){
    if (err.message = "Cannot open database because the directory does not exist"){
      logger.error("engine", "twig is not initialized here")
    } else {
      throw err
    }
  }
  /*
  const deleteBranch = db.prepare(`
            DELETE FROM branches
            WHERE name = ?
            `)
  */

  const deleteBranch = db.prepare(`
    UPDATE branches
    SET deleted = true
    WHERE name = ?;
    `);

  return deleteBranch.run(name)

}

export function undoDeleteBranch(name){
  try {
    const db = getDb()
  } catch (err){
    if (err.message = "Cannot open database because the directory does not exist"){
      logger.error("engine", "twig is not initialized here")
    } else {
      throw err
    }
  }
  const undoDeleteBranch = db.prepare(`
    UPDATE branches
    SET deleted = false
    WHERE name = ?;
    `);

  return undoDeleteBranch.run(name)

}

export function updateCommitSha(commit, sha){
  try {
    const db = getDb()
  } catch (err){
    if (err.message = "Cannot open database because the directory does not exist"){
      logger.error("engine", "twig is not initialized here")
    } else {
      throw err
    }
  }
  const update_commit_sha = db.prepare(`
    UPDATE objects
    SET commit_sha = ?
    WHERE hash = ?;
    `);
  return update_commit_sha.run(sha, commit)

}