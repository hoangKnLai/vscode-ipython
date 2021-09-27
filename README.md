# ipython

Simple hooks to enable direct execution of `python` code from editor to an IPython console.


## Features

Key features tagged with `IPython`:
- Configurations to control the startup of an IPython console
- On an active IPython console, added commands to:
    - Run a file
    - Run selection(s) of code
    - Run a cell block defined by standard (`# %%`) tag

![feature X](md_img/vscode-ipython.png)

## Requirements

[Microsoft Python Extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python)
- Can also be found in Extension tab

## Extension Settings

`ipython` automatically activated when editor language is `Python`.

Contributes the following settings:
* `ipython.launchArgs`: create a IPython terminal using the arguments provided.
* `ipython.startupCommands`: execute the set of commands automatically after IPython terminal is created.

## Known Issues

- Cannot resolve recently used IPython terminal when it is not the currently active terminal
    - Currently will select most recently created terminal when an IPython terminal is not the current active terminal.
- Missing keyboard shortcut
- This README.md and other *.md can use improvement

## Release Notes

### 2021.09.26

Hot of the press

**Enjoy!**
