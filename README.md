<div align="center">
  
![header](https://github.com/anshxlm/twig/blob/69236ec584726e7c94fd2306635e0e669c6558a0/docs/header.png)

# **Fast, smart version control**

</div>

Twig is a fast and powerful version control client with Github compatibility, custom file hosting, and a built in AI to ask about your commits. 

![commit demo](https://github.com/anshxlm/twig/blob/3157754cb0a2a71954ccbebb8ee1dd87a66d3c3b/docs/hero.gif)

## Table of Contents
1. [Introduction](#introduction)
2. [Get started](#)
3. [Features](#)
4. [Architecture](#)
## Introduction
Twig is a command-line version control system built on NodeJS. It is designed to capture snapshots of your work allowing you to track the complete history of a project. It has the core features of a version control system, 
## Get started
Installation is simple. Make sure you have NodeJS along with npm installed, and then run:

```
npm install -g twigvc
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

Congrats on getting started with Twig! Read the rest of the features [here](#)

## Commands
| Command | Description |
|---------|-------------|
| [`init`](#twig-init) | Initialize a new Twig repository. |
| [`commit`](#twig-commit) | Create a snapshot of the current project state. |
| [`compare`](#twig-compare) | Compare two commits |
| [`log`](#twig-log) | Display commit history. |
| [`branch`](#twig-branch) | Create or delete branches. |
| [`branches`](#twig-branches) | List all branches |
| [`checkout`](#twig-checkout) | Checkout a branch or commit |
| [`merge`](#twig-merge) | Merge a branch into the current branch |
| [`rollback`](#twig-rollback) | Rollback to a commit |
| [`github push`](#twig-github-push) | Push commits to Github |
| [`github pull`](#twig-github-pull) | Pull commits from Github |
| [`gui`](#twig-gui) | Launch the local twig web interface. |
| [`login`](#twig-login) | Authenticate with twigs file hosting server. |
| [`push`](#twig-push) | Upload commits and objects to store on twig servers. |

## `twig init`

Initializes a new Twig repository in the current directory by creating a `.twig` directory.

For example, running `twig init` inside `C:\Users\user1\myProject` creates `C:\Users\user1\myProject\.twig`

During initialization, Twig prompts for a repository name. This name is only required if you intend to push the repository to a remote host such as Twighub.

> [!NOTE]
> Repository names must be unique per user on the remote host. If another repository with the same name already exists in your account, the initial push will be rejected.

## `twig commit`

Creates a snapshot of the current project state.

Twig scans the working directory, stores any new or modified objects, constructs a new tree, and creates a commit that records the project's state at that point in time.

`twig commit -m "Implement authentication"`

Every commit references its parent commit, allowing the complete project history to be reconstructed.

## Commands

| Command | Description |
|---------|-------------|
| [`init`](#twig-init) | Initialize a new Twig repository. |
| [`commit`](#twig-commit) | Create a snapshot of the current project state. |
| [`compare`](#twig-compare) | Compare commits, trees, or the working directory. |
| [`log`](#twig-log) | Display commit history. |
| [`branch`](#twig-branch) | Create, list, or delete branches. |
| [`checkout`](#twig-checkout) | Switch branches or restore a previous commit. |
| [`gui`](#twig-gui) | Launch the local Twig web interface. |
| [`login`](#twig-login) | Authenticate with Twighub. |
| [`push`](#twig-push) | Upload local commits to a remote repository. |

---

## `twig init`

Initializes a new Twig repository in the current directory by creating a `.twig` directory.

For example, running

```bash
twig init
```

inside

```text
C:\Users\user1\myProject
```

creates

```text
C:\Users\user1\myProject\.twig
```

During initialization, Twig prompts for a repository name. This name is only required if you intend to push the repository to a remote host such as Twighub.

> [!NOTE]
> Repository names must be unique per user on the remote host. If another repository with the same name already exists in your account, the initial push will be rejected.

---

## `twig compare`

Compares two commits, trees, or the current working directory.

Changed files are categorized as:

- Added
- Modified
- Deleted
- Unchanged

Examples:

```bash
twig compare
```

Compare the working directory against the latest commit.

```bash
twig compare <commitA> <commitB>
```

Compare any two commits.

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

## `twig branch`

Creates, lists, and deletes branches.

List all branches:

```bash
twig branch
```

Create a branch:

```bash
twig branch feature-login
```

Delete a branch:

```bash
twig branch -d feature-login
```

---

## `twig checkout`

Switches the working directory to another branch or commit.

Switch branches:

```bash
twig checkout main
```

Checkout a previous commit:

```bash
twig checkout <commit>
```

The working directory is updated to match the snapshot stored by the selected commit.

---

## `twig gui`

Starts Twig's local web interface.

The command launches a local HTTP server and opens your default browser, allowing you to browse commits, inspect branches, compare changes, and manage your repository through a graphical interface.

```bash
twig gui
```

---

## `twig login`

Authenticates the local CLI with your Twighub account.

Running the command opens the Twighub authentication page in your browser. After signing in, Twig securely stores a session token locally, allowing future commands such as `twig push` to authenticate automatically.

```bash
twig login
```

---

## `twig push`

Uploads local commits and objects to a remote repository.

On the initial push, Twig:

1. Creates the remote repository.
2. Uploads all blob objects.
3. Synchronizes commit, tree, and branch metadata.

Subsequent pushes upload only newly created objects and updated branch references, minimizing network usage.

```bash
twig push
```

> [!NOTE]
> A successful `twig login` is required before pushing to a remote repository.