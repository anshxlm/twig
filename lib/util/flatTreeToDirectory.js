export default function flatTreeToDirectory(flatTree){
const root = {};

for (const [filepath, blobHash] of Object.entries(flatTree)) {

    const parts = filepath.split("/");

    let current = root;

    while (parts.length > 1) {

        const folder = parts.shift();

        current[folder] ??= {};

        current = current[folder];

    }

    current[parts[0]] = blobHash;

}

return root
}