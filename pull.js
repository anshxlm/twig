import fs from "fs";
import path from "path";
import { Octokit } from "@octokit/core";

async function pullFromRemote() {
  const octokit = new Octokit({ auth: "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" });
  const db = getDb();

  const OWNER = "anshxlm";
  const REPO = "twigtesting";
  const currBranch = fs.readFileSync("./.twig/HEAD", "utf8").trim();
  const BRANCH = currBranch === "master" ? "main" : currBranch;

  console.log(`Checking for updates on remote branch: ${BRANCH}...`);

  // 1. Get the latest remote commit SHA
  const { data: refData } = await octokit.request("GET /repos/{owner}/{repo}/git/ref/heads/{branch}", {
    owner: OWNER,
    repo: REPO,
    branch: BRANCH
  });
  const remoteCommitSha = refData.object.sha;

  // Check if we are already up to date
  const getBranchCommit = db.prepare("SELECT commit_hash FROM branches WHERE name = ?");
  const localCommitSha = getBranchCommit.get(currBranch)?.commit_hash;

  if (localCommitSha === remoteCommitSha) {
    console.log("Already up to date!");
    return;
  }

  // 2. Get the remote commit details to find its root tree
  const { data: commitData } = await octokit.request("GET /repos/{owner}/{repo}/git/commits/{commit_sha}", {
    owner: OWNER,
    repo: REPO,
    commit_sha: remoteCommitSha
  });
  const remoteTreeSha = commitData.tree.sha;

  // 3. Fetch the full recursive remote tree
  const { data: treeData } = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=true", {
    owner: OWNER,
    repo: REPO,
    tree_sha: remoteTreeSha
  });

  // Build a map of remote files: { "filepath": "blob_sha" }
  const remoteFiles = {};
  for (const item of treeData.tree) {
    if (item.type === "blob") {
      remoteFiles[item.path] = item.sha;
    }
  }

  // Build a map of your current local files from your DB/working directory
  // (Assuming you have a helper function to get the current local tree map)
  const localFiles = getLocalTreeMap(localCommitSha); 

  // 4. Determine what needs to be downloaded or deleted
  const toDownload = [];
  const toDelete = [];

  // Check for additions and modifications
  for (const [filePath, sha] of Object.entries(remoteFiles)) {
    if (!localFiles[filePath] || localFiles[filePath] !== sha) {
      toDownload.push({ path: filePath, sha: sha });
    }
  }

  // Check for deletions (files present locally but missing in remote tree)
  for (const filePath of Object.keys(localFiles)) {
    if (!remoteFiles[filePath]) {
      toDelete.push(filePath);
    }
  }

  console.log(`Pulling changes: ${toDownload.length} files to update, ${toDelete.length} files to remove.`);

  // 5. Apply deletions locally
  for (const filePath of toDelete) {
    const fullPath = path.resolve("./", filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`Deleted: ${filePath}`);
    }
  }

  // 6. Download and write modified/added files in parallel batches
  const CONCURRENCY_LIMIT = 25;
  for (let i = 0; i < toDownload.length; i += CONCURRENCY_LIMIT) {
    const chunk = toDownload.slice(i, i + CONCURRENCY_LIMIT);

    await Promise.all(
      chunk.map(async (file) => {
        // Fetch the raw blob data from GitHub
        const { data: blobData } = await octokit.request("GET /repos/{owner}/{repo}/git/blobs/{file_sha}", {
          owner: OWNER,
          repo: REPO,
          file_sha: file.sha
        });

        // GitHub blobs are Base64 encoded by default
        const fileContent = Buffer.from(blobData.content, "base64");
        const fullPath = path.resolve("./", file.path);

        // Ensure the directory exists before writing the file
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        
        // Overwrite or create the local file
        fs.writeFileSync(fullPath, fileContent);
        
        // Optional: Save the downloaded blob into your local `.twig/files/` store
        fs.writeFileSync(path.resolve("./.twig/files/", file.sha), fileContent);
        
        console.log(`Updated: ${file.path}`);
      })
    );
  }

  // 7. Update your local SQLite DB and branch pointer to the new commit
  const updateBranch = db.prepare("UPDATE branches SET commit_hash = ? WHERE name = ?");
  updateBranch.run(remoteCommitSha, currBranch);

  console.log(`Successfully pulled and updated local filesystem to commit ${remoteCommitSha.slice(0, 7)}!`);
}

pullFromRemote()