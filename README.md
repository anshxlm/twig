<div align="center">
  
![header](https://github.com/anshxlm/twig/blob/69236ec584726e7c94fd2306635e0e669c6558a0/docs/header.png)

# **Fast, smart version control**

</div>

Twig is a fast and powerful version control client with Github compatibility, custom file hosting, and a built in AI to ask about your commits. 

![commit demo](https://github.com/anshxlm/twig/blob/3157754cb0a2a71954ccbebb8ee1dd87a66d3c3b/docs/hero.gif)

# **Note:** <span style="color:green;">This project includes the custom file hosting server/site and it's code is [here](https://github.com/anshxlm/twig-server)</span>


## Table of Contents
1. [Introduction](#introduction)
2. [Quick Start](#quick-start)
3. [Commands](#commands)
4. [Architecture](#architecture)
5. [Credits](#credits)


## Introduction
Twig is a command-line version control system built on NodeJS. It is designed to capture snapshots of your work allowing you to track the complete history of a project. It has the core features of a version control system, 

### Package

The package can be found on npm [here](https://www.npmjs.com/package/@anshul37_/twig)

## Quick Start
Installation is simple. Make sure you have NodeJS along with npm installed, and then run:

```
npm i @anshul37_/twig
```
From there, initialize twig in your working directory
```
twig init
```
Make your first commit with
```
twig commit -m "my first commit"
```
Read the commit back with
```
twig log
```

## Commands
| Command | Description |
|---------|-------------|
| [`init`](#twig-init) | Initialize a new Twig repository. |
| [`commit`](#twig-commit) | Create a snapshot of the current project state. |
| [`log`](#twig-log) | Display commit history. |
| [`compare`](#twig-compare) | Compare two commits |
| [`branch`](#twig-branch) | Create or delete branches. |
| [`branches`](#twig-branches) | List all branches |
| [`checkout`](#twig-checkout) | Checkout a branch or commit |
| [`merge`](#twig-merge) | Merge a branch into the current branch |
| [`rollback`](#twig-rollback) | Rollback to a commit |
| [`github push`](#twig-github-push) | Push commits to Github |
| [`github pull`](#twig-github-pull) | Pull commits from Github |
| [`gui`](#twig-gui) | Launch the local twig web interface. |
| [`login`](#twig-login) | Authenticate with twig file hosting server. |
| [`push`](#twig-push) | Upload commits and objects to store on twig/your servers. |
| [`ai`](#twig-ai) | Talk to the built in Twig AI |
| [`set remote`](#twig-set-remote) | Set Github URL for the current project |
| [`set server`](#twig-set-server) | Set the global, custom file hosting server URL. Defaults to twig servers. |
| [`set gemini`](#twig-set-gemini) | Set your global Gemini API key |

## `twig init`

Initializes Twig in the current working directory by creating a `.twig` folder.

For example, running `twig init` inside `C:\Users\user1\myProject` creates `C:\Users\user1\myProject\.twig`

## `twig commit`

Creates a commit of the current project state.

Twig scans the working directory, stores any new or modified objects, and creates a commit that records the project's state at that point in time.

`twig commit -m "Implement authentication"`

Every commit references its parent commit, allowing the project history to be reconstructed.
---

## `twig log`

Displays the commit history of the current branch.

Each commit includes:

- Commit hash
- Author
- Timestamp
- Commit message

```bash
twig log
```

Future versions of Twig will include graphical commit history visualization and merge commit rendering.

---

## `twig compare`

Compares two commits.

Changed files are categorized as:

- Added
- Modified
- Deleted

Example:

```bash
twig compare bebfbec8 24549b3d
```

Output:

```
ADDED docs/README.md
DELETED tests/parser.js
MODIFIED src/lib/utils.js
```

Compare the working directory against the latest commit.

---

## `twig branch`

Create and delete branches.

Create a branch:

```bash
twig branch feature1
```

Delete a branch:

```bash
twig branch --rm feature1
```

---

## `twig branches`

List all branches.

```bash
twig branches
```

---

## `twig checkout`

Switches the working directory to another branch or commit.

Switch branches:

```bash
twig checkout master
```

Checkout a previous commit:

```bash
twig checkout ae82c3f3
```

The working directory is updated to match the snapshot stored by the selected commit/branch.

---

## `twig merge`

Merge a branch into the current branch

For example, if your current branch is master, using:

```bash
twig merge feature
```

will merge branch feature into branch master.

---

## `twig rollback`

Rollback the working directory and commit log to a certain commit

```bash
twig rollback b0f45dd0
```

This will restore the working directory to what it was at the specific commit, and remove all the commits succeeding it. 

---

## `twig github push`

Push all the commits on your local machine that don't exist on Github to it. 

```bash
twig github push
```

---

## `twig github pull`

Pull commits from Github that don't exist on your local machine.

```bash
twig github pull
```

---

## `twig gui`

Starts Twig's local web interface.

This command starts a local HTTP site allowing you to browse each branches commits, and explore the file system at each commit.

```bash
twig gui
```

---

## `twig login`

Authenticates the local CLI with your file hosting account.

Running the command opens the authentication page. After signing in, Twig stores a session token locally, allowing future commands such as `twig push` to authenticate automatically.

```bash
twig login
```

---

## `twig push`

Uploads local commits and objects to file hosting server.

Subsequent pushes upload only newly created objects and updated branch references.

```bash
twig push
```

## `twig ai`

Spin up a local MCP server that reads your .twig folder and then uses your Google Gemini API key to start a chat directly in the terminal. You can ask about your commit history, specific commits, branches, and ask it to inspect files. 

```bash
twig ai
```

## `twig set gemini`

Save your Google Gemini API key globally so `@twig/ai` can authenticate and run terminal AI chat sessions.

```bash
twig set gemini YOUR_API_KEY
```

---

## `twig set remote`

Set the remote GitHub repository URL for the current project workspace.

```bash
twig set remote https://github.com/username/repository.git
```

---

## `twig set server`

Set the global custom Twig server host URL (provide the base URL **without** paths, like `https://myServer/` instead of `https://myServer/api/push`). Defaults to official Twig servers.

```bash
twig set server https://myServer/
```

## Architecture

Twig stores everything as content-addressed objects in a SQLite database inside the .twig directory. A file is a blob, a directory is a tree that points to blobs and other trees, and a commit points to a root tree, its parent commit, and some metadata. Each object is keyed by a hash of its contents.

Branches live in their own table. Each one maps a name to a commit hash, so a branch is really just a pointer you can move forward as work lands on that line of development.

When you commit, Twig takes a snapshot of your working directory and builds trees from the bottom up to mirror its folder structure. It stores any blobs and trees it hasn’t seen before, then writes a new commit that points to the resulting root tree, with the previous commit as its parent.

Checking out a branch works in reverse. Twig looks up the branch’s commit, walks that commit’s root tree, and rebuilds your working directory from the blobs it references.

Merging starts by walking back through both commits’ histories to find their most recent common ancestor, the merge base. From there, Twig does a three-way comparison of the base, your current branch, and the incoming branch, using the file path to hash mappings to see what changed on each side. If only one side touched a file, that change is applied automatically. If both sides made the identical change, it’s accepted as is. If both changed the same file differently, you choose which version to keep.

For GitHub compatibility, Twig uses isomorphic-git to translate its commits and trees into regular Git objects, then pushes and pulls using Git’s own object and reference model.

When you push to your custom / twig server, the CLI determines what additions were made between the last pushed commit and the latest one. It then pushes the SQLite database to the server route, and the additional blobs. The server then maps the SQLite into Supabase tables, and the additions into Microsoft Azure Blob Storage. A diagram below provides a visual on this.

![architecture diagram](https://github.com/anshxlm/twig/blob/25567e12645d2212af38cdd7437869f3cbf151ec/docs/Twig%20Architecture.drawio.svg)


## Credits

A major shoutout to [this article](https://coderefinery.github.io/git-intro/under-the-hood/) which has a helpful explanation of how Git works under the hood.

Thank you to the developers and maintainers of [NodeJS](https://nodejs.org/en), [yargs](https://www.npmjs.com/package/yargs), and [isomorphic-git](https://www.npmjs.com/package/isomorphic-git).

