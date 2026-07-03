import { AIProjectClient } from "@azure/ai-projects";
import { AzureKeyCredential } from "@azure/core-auth";

const client = AIProjectClient.fromConnectionString(
    process.env.PROJECT_ENDPOINT,
    new AzureKeyCredential('5HIhBMyQ0r4CqPK1tjlVepgQR2M9T4Upkqx3qSStkcNwLa2sJ5CcJQQJ99CGACMsfrFXJ3w3AAAAACOGkUoe')
);

// Create thread
const thread = await client.agents.createThread();

// Add message
await client.agents.createMessage(
    thread.id,
    "user",
    "Hello!"
);

// Run your agent
const run = await client.agents.createRun(
    thread.id,
    agentId
);

// Wait for completion
await client.agents.createRunAndPoll(
    thread.id,
    agentId
);

// Read messages
const messages = await client.agents.listMessages(thread.id);