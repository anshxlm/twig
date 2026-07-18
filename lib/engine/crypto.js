import crypto from 'node:crypto'
import fs, { existsSync, read } from 'node:fs';

export function hashFileStream(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha1");
    const stream = fs.createReadStream(filePath);
    
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

export function hash(data) {
    return crypto.createHash("sha1").update(data).digest("hex");
}
