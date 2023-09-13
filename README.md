# ipython

Enable IPython Terminal creation and direct execution of `python` code from
editor.

If you find the extension useful, it would be awesome if you can leave a comment and/or a suggestion on GitHub!!

- What feature you like and use the most?
- What other feature(s) you would like to have?

## Features

Key features tagged with `IPython`:

- Configurations to control the startup of an IPython terminal
  - Launch argument (e.g., `--matplotlib=qt`)
  - Start up command (e.g., `["%load_ext autoreload", %autoreload 2]`)
- Configurable:
  - Multiple code section tags (e.g., `# %%`, `// ==`, or regular expression)
  - Code section tag applies to a list of file extensions (e.g., `.py, .ts, .md`)
  - `%run` arguments (e.g., `-t` print timing info)
  - Command line arguments (e.g., `sys.argv` parameters)
- Useful command to run `python` code interactively
  - E.g., run a file, selection(s) of code, code section, run to line, run from line, ...
- Code formatting for visualizing section blocks (#25)
- Code section tree view and navigation (#30)

See `ipython: Feature Contribution` tab in VSCode Extension (Ctrl + Shift + X)
panel for latest features and details.

![feature X](md_img/vscode-ipython-v2023x.png)

## Requirements

[Microsoft Python Extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python)

**Strongly recommend setting `Git Bash` as default terminal on Window to properly launch an IPython terminal.**

## Release Notes

### 2023.9.x

- Refactored cell of code to section of code for clarity
- Refactored run options:
  - Removed `reset` and then `run` options since `%run` does this by default
  - Run section is defaulted to use `.vscode/ipython/code.py` with
    identification
    - E.g., `%run -i ".vscode/ipython/code.py"  # %% Section A (Line 1:10)`
  - Added option to use `code.py` to run code sections with `%run -i` or `%load`
    - Recommend `%run -i` for speed and clarity
    - NOTE: likely to deprecated usage of `%load` in a future release

- Removed usage of `clipboard` option for sending code to terminal
  - It was hacky and intrusive

- Added tree view for file section (indicated by a set of `cellTag` such as `# %%`)
  - `jumpToSection`: jump to section in text editor and focus on it
    - Support any text files with `cellTag`
  - `runFile, runSection`: excution interaction on tree view
    - Support a configurable set of file extensions such as `.py, .ts, .md`

### 2023.8.x

- Added section dividers
- Added an alpha feature `runLineAndAdvance` (#18)
- Defaulting send code to `file` instead of `clipboard`

### 2023.3.x

- Fixed a minor bug with sending multi-line code on Linux

### 2023.2.x

- Added a `SendCommandMethod` setting with `file` or `clipboard` options
  - `file`: uses `.vscode/ipython/command.py` and `%load command.py` to terminal
  - `clipboard`: prior method of copy-paste via system clipboard
- Fixed a bug with calling `ipython` with an empty  `--InteractiveShellApp.exec_lines=''`. See issue #21.

### 2022.9.x

- Fixed a bug with `runSelection` executing line-by-line on Linux instead of as a block (issue #17)
- Always save file in `runFile` command so that `%run` magic works as intended
  - Other `run` commands (e.g., `selection`, `toLine`, `fromLine`) respect user choice
- Added `Move Cursor to Section Tag Above/Below`
- Added `Run Arguments` and `Command Line Arguments` for `Run File` variants
  - Default `F5` to `Run File with Command Line Arguments`
    - If `Command Line Arguments` is empty, then it reduces to regular `Run File`
  - Added `Shift+F5` to `Run File with Run and Command Line Arguments`
    - Defaulted `Run Arguments` to `-t` which prints `%run` timing
- Fixed a bug with `Run Section` skipping last section line
- Configuration applies immediately when changed instead of only when extension
activated

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
- More details in [issue `#11` note](https://github.com/hoangKnLai/vscode-ipython/issues/11#issuecomment-1186551199)

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
- Added run section and go to next (`ipython.runSectionAndMoveToNext`)
- Added customizable section block tag option
- Other minor QoL

**Fixes:**

- Fixed versioning number
- Default settings
- Various small bugs

### 2021.09.0

Hot of the press!
