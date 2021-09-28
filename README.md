# ipython

Simple hooks to enable direct execution of `python` code from editor to an IPython console.


## Features

Key features tagged with `IPython`:
- Configurations to control the startup of an IPython console
- On an active IPython console, added commands to run Python code interactively
    - E.g. Run a file, selection(s) of code, cell block, etc.

![feature X](md_img/vscode-ipython.png)

## Requirements

[Microsoft Python Extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python)
- Can also be found in Extension tab

## Known Issues

- Cannot resolve recently used IPython terminal when it is not the currently active terminal
    - Currently will select most recently created terminal when an IPython terminal is not the current active terminal.
- Missing keyboard shortcut
- This README.md and other *.md can use improvement

## Release Notes

### 2021.09.1

**Features**:
- Added keybinds (overwrite base interactive python and Jupyter)
  - Recommend rebind as needed
- Added run cell and go to next (`ipython.runCellAndMoveToNext`)
- Added customizable cell block tag option
- Other minor QoL

**Fixes:**
- Fixed versioning number
- Default settings
- Various small bugs

### 2021.09.0

Hot of the press!

**Enjoy!**
