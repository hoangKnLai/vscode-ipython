# ipython

Hooks to enable direct execution of `python` code from editor to an
IPython terminal.

If you find the extension useful, it would be awesome if you can leave a comment
 here and/or suggestion on GitHub!!
- What feature you like and use the most?
- What other feature(s) you would like to have?
## Features

Key features tagged with `IPython`:
- Configurations to control the startup of an IPython console
  - Console launch argument (e.g., `--matplotlib=qt5`)
  - Console start up command (e.g., `["%load_ext autoreload", %autoreload 2]`)
  - Configurable cell block tag (e.g. `# %%`)
- Added commands to run `python` code interactively
  - E.g. Run a file, selection(s) of code, cell block, run to line, run from line, ...

![feature X](md_img/vscode-ipython.png)

See `ipython: Feature Contribution` tab in VSCode Extension (Ctrl + Shift + X) panel for latest features and details.

## Requirements

[Microsoft Python Extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python)

**Strongly recommend setting `Git Bash` as default terminal on Window to properly launch an IPython terminal.**

## Known Issues
- Keybinding conflict with Jupyter extension
  - Recommend enabling only one extension at a time and/or map the keybinding to
  deconflict
    - If anyone has a good deconflict keybinding json, it is awesome if you can
    share it on this project GitHub issue page. Thanks!
- Not a direct hook to the IPython API
  - Might not be possible. It appears that IPython API requires spawning and
  communicating with a sub `python` process.
- Cannot resolve recently used IPython terminal when it is not the current
active terminal
  - Always use most recently created terminal
- This README.md and other *.md can use improvement

## Release Notes

### 2022.7.x
- Changed handling of code block from `%load` to directly sending it to terminal.
  - **NOTE**: sending large text block to IPython sometime causes it to reder
  incorrectly. If needed, use `up-arrow-key` to see actual code executed.
    - Restarting, creating a new IPython terminal, or resize it to be more
    vertical usually fixes the rendering issue.
- Added run line at cursor
  - If runSelections is called and no text selected, then run the line the
  cursor is on.
  - This applies independently for each cursor (e.g., `Alt+Click` adds more cursors)
- More details in [issue #11 note](https://github.com/hoangKnLai/vscode-ipython/issues/11#issuecomment-1186551199)
### 2022.4.x
- Changed `execute()` of `python` code ensuring an `ExecLagMilliSec` between
every major `enterKey` pressed to `IPython` terminal.
  - User should adjust `ExecLagMilliSec` fitting their computer performance
- Added `ExecLagMilliSec` configuration to help with sendText race condition
- Added `reset and run` command

### 2021.10.17
- Added an 100ms between every command execution to alleviate sendText
race condition

### 2021.10.15

**Fixes:**
- ipython.createTerminal startup commands and launch commands race condition

### 2021.10.3

**Fixes:**
- ipython.createTerminal not executing startup commands correctly

### 2021.10.3

**Features**:
- Handling of encoding `# -*- coding: <encoding-name> -*-` automatically when
parsing code to send to IPython console
- Added ipython.runToLine and ipython.runFromLine

**Fixes:**
- Keybindings
- Default settings
- Various small bugs

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

