import { GoogleGenAI, mcpToTool } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { input } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";

const transport = new StdioClientTransport({
  command: "node",
  args: ["D:\\twig\\lib\\mcp\\server.js", "D:\\twig-feature-demo\\.twig\\tree.db"],
});

const mcpClient = new Client(
  { name: "twig-version-control", version: "1.0.0" },
  { capabilities: {} }
);

await mcpClient.connect(transport);

const ai = new GoogleGenAI({});
const mcpTool = await mcpToTool(mcpClient);


const chat = ai.chats.create({
  model: "gemini-3.5-flash-lite",
  config: {
    tools: [mcpTool],
    systemInstruction: "You are a command line AI tool, so formatting response with bold etc. does not work. You are the AI for a version control client similiar to git. The connected MCP server is all you need.",
  },
});

      console.log(chalk.yellowBright('Use CTRL+C to exit'))
while (true) {
    try {
      const answer = await input({
         message: chalk.bold('>'),
         theme:{
          prefix: chalk.blueBright.bold('@twig/ai'),
          style:{
            answer:(text) => chalk.italic(text)
          }
         }
        })

        console.log()
        const spinner = ora('Generating...').start()
        let response = await chat.sendMessage({message: answer});
        spinner.stop()
        console.log(chalk.magenta(response.text + '\n'))

      } catch (err) {
        if (err.name === 'ExitPromptError'){
          console.log('\nExited ' + chalk.blueBright.bold('@twig/ai'))
          await mcpClient.close()
          process.exit()
        }
      }
    }