#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { mcpDatabase } from "./mcp-database.js";

const args = process.argv.slice(2);

const database = new mcpDatabase(args[0])

const server = new McpServer({
  name: "twig",
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

const transport = new StdioServerTransport();
await server.connect(transport);