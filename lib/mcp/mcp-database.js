import Database from 'better-sqlite3';
import { Logger } from '../process/logger.js'

const logger = new Logger()

export class mcpDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  getDb() {
    if (!this.db) {
      this.db = new Database(this.dbPath);
      this.db.pragma("journal_mode = WAL");
    }

    return this.db;
  }

  insertObject(hash,type,data, sha){
    try {
      var db = this.getDb()
    } catch (err){
      if (err.message = "Cannot open database because the directory does not exist"){
        logger.error("engine", "twig is not initialized here")
      } else {
        throw err
      }
    }
    if (!sha){
      const insertObject = db.prepare(`
          INSERT OR IGNORE INTO objects(hash,type,data)
          VALUES(?,?,?)
      `);
      return insertObject.run(hash,type,data)
      } else {
        const insertObject = db.prepare(`
          INSERT OR IGNORE INTO objects(hash,type,data,commit_sha)
          VALUES(?,?,?,?)
      `);
      return insertObject.run(hash,type,data,sha)
      }

  }

  getObject(hash){
    try {
      var db = this.getDb()
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

  getObjectLike(hash){
    try {
      var db = this.getDb()
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

  setParentBranch(hash, branchName){
    try {
      var db = this.getDb()
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

  getBranch(name, deleted=false){
    try {
      var db = this.getDb()
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

  newBranch(name, commit_hash){
    try {
      var db = this.getDb()
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

  getAllBranches(){
    try {
      var db = this.getDb()
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

  deleteBranch(name){
    try {
      var db = this.getDb()
    } catch (err){
      if (err.message = "Cannot open database because the directory does not exist"){
        logger.error("engine", "twig is not initialized here")
      } else {
        throw err
      }
    }
    const deleteBranch = db.prepare(`
      UPDATE branches
      SET deleted = true
      WHERE name = ?;
      `);

    return deleteBranch.run(name)

  }

  undoDeleteBranch(name){
    try {
      var db = this.getDb()
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

  updateCommitSha(commit, sha){
    try {
      var db = this.getDb()
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
}