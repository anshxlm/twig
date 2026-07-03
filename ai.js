import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: "https://anshul-twig-resource.openai.azure.com/openai/v1/",
});

const conversation = await client.conversations.create({
  items: [
    {
      type: "message",
      role: "user",
      content: "Hello!",
    },
  ],
});

const response = await client.responses.create(
  {
    conversation: conversation.id,
  },
  {
    body: {
      agent: {
        type: "agent_reference",
        name: "twig",
        version: "3",
      },
    },
  }
);

console.log(response.output_text);