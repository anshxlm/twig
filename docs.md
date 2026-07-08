# **Twig Docs**
This is Twig, a lightning fast version control client. Below you will find detailed documentation into how it works as well as commands and website features.
## Table of Contents
1. [Introduction](#introduction)
2. [Get started](#)
3. [Architecture](#)
4. [Features](#)
## Introduction
Twig is a command-line version control system built on NodeJS and distributed through npm. It is designed to capture snapshots of your work reliably and efficiently, allowing you to track the complete history of a project with speed. It has the core features of a version control system, including repository initialization, commits, branching, merging, history inspection, and synchronization with its own remote. Files are stores in a space efficient manner identical file contents are never stored more than once within a repository. Twig also includes **xxx**, a hosting platform for remote repositories.
## Get started
Installation is simple. Make sure you have NodeJS along with npm installed, and then run:

```
npm install -g twigvcs
```
From there, initialize twig in your working directory
```
twig init
```
> [!NOTE]
> Twig automatically makes an initial commit with the `init` command, and defaults to the branch `master`.

Make your first commit with
```
twig commit -m "my first change"
```
Congrats on getting started with Twig! Read the rest of the features [here](#)