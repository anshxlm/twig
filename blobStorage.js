import { BlobServiceClient } from '@azure/storage-blob'

async function main() {
  try {

console.log("Azure Blob storage v12 - JavaScript quickstart sample");

const AZURE_STORAGE_CONNECTION_STRING = "DefaultEndpointsProtocol=https;AccountName=twigcli;AccountKey=5t980nuGurYYG0SUP8NM3REXr8kFFaga+U+ETVFxC83EgyeAPap/glFPNHZZ728BWk0FkqM80Q5K+AStortvyw==;EndpointSuffix=core.windows.net"

const blobServiceClient = BlobServiceClient.fromConnectionString(
  AZURE_STORAGE_CONNECTION_STRING
);

const containerName = 'quickstart' + uuid();

console.log('\nCreating container...');
console.log('\t', containerName)
const containerClient = blobServiceClient.getContainerClient(containerName);
const createContainerResponse = await containerClient.create();
console.log(
  `Container was created successfully.\n\trequestId:${createContainerResponse.requestId}\n\tURL: ${containerClient.url}`
);


const blobName = 'quickstart' + uuid() + '.txt';

const blockBlobClient = containerClient.getBlockBlobClient(blobName);

console.log(
  `\nUploading to Azure storage as blob\n\tname: ${blobName}:\n\tURL: ${blockBlobClient.url}`
);


const data = 'Hello, World!';
const uploadBlobResponse = await blockBlobClient.upload(data, data.length);
console.log(
  `Blob was uploaded successfully. requestId: ${uploadBlobResponse.requestId}`
);



  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
}

main()
  .then(() => console.log("Done"))
  .catch((ex) => console.log(ex.message));