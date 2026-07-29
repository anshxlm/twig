#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { mcpDatabase } from "./mcp-database.js";
import path from 'path'

const args = process.argv.slice(2);

const dbPath = path.join(args[0], 'tree.db')
const filePath = path.join(args[0], 'files')

const database = new mcpDatabase(dbPath)

const server = new McpServer({
  name: "twig version control",
  version: "1.0.0",
});

server.tool(
  "get_commit",
  "Get a commit using the entire hash OR first 8 characters of the hash, and then specify what data you want in return.",
  { 
    hash: z.string().default("06756e3b1624ad824a1ebd3574911be1bb36b346").describe("The partial/full hash of the commit"),
    content: z.enum(["all", "tree", "parent", "message", "when"]).describe("The data you want in return. Options are all (returns JSON), tree, parent, message, when")
},
  async ({ hash, content }) => {
    if (content == "all"){
        const commit = JSON.parse(database.getObjectLike(`${hash}%`).data)
        return {
        content: [{type:"text", text:JSON.stringify(commit)}],
        }
    }
    const commit = JSON.parse(database.getObjectLike(`${hash}%`).data)
        return {
        content: [{type:"text", text:commit[content]}],
        }
    }
);

server.tool(
  "get_commit_history",
  "Get the commit history of a branch. Returns a 2D array of [commitID, message]",
  { 
    branch: z.string().default("master").describe("The branch name to get history of.")},
  async ({ branch }) => {

    let commit = database.getBranch(branch).commit_hash
    let history = []
    while (commit){
        const commitData = JSON.parse(database.getObject(commit).data)
        history.push([commit.slice(0,8), commitData.message])
        commit = commitData.parent
    }

    return {
        content:[{type:"text", text:JSON.stringify(history)}]
    }

    }
);

server.tool(
  "list_branches",
  "List all branches for a repo and their latest commit hash. Returns 2D array of [name, commitID] array.",
  async ({ branch }) => {

    const branches = []

    for (const branch of database.getAllBranches()){
      branches.push([branch.name, branch.commit_hash])
    }

    return {
        content:[{type:"text", text:JSON.stringify(branches)}]
    }

    }
);

server.tool(
  "get_tree",
  "Get a tree object by full hash. Returns the tree entries as JSON.",
  { hash: z.string().describe("Full tree hash") },
  async ({ hash }) => {
    const tree = JSON.parse(database.getObject(hash))

    return { content: [{ type: "text", text: JSON.stringify(tree) }] }
    
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);