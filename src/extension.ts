// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { privateEncrypt } from "crypto";
import { moveCursor } from "readline";
import * as vscode from "vscode";

// === CONSTANTS ===
let newLine: string = "\n"; // default to eol === 1
let editor = vscode.window.activeTextEditor;
if (editor !== undefined) {
  let eol = editor.document.eol;
  if (eol === 2) {
    newLine = "\r\n";
  }
}
// \x0A is hex code for `Enter` key which likely is better than \n
// let enterKey: string = "\x0A";
// let enterKey:string = newLine;

let terminalName = "IPython"; //TODO: consider making configurable?!

// === FUNCTIONS ===
async function activatePython() {
  let pyExtension = vscode.extensions.getExtension("ms-python.python");
  if (pyExtension === undefined) {
    console.error("Failed to get MS-Python Extension");
    return;
  }
  await pyExtension.activate();
}

function getConfig(name: string) {
  let config = vscode.workspace.getConfiguration("ipython");
  return config.get(name);
}

// NOTE: don't need when not using `%load`
// function checkEncodingTag(document: vscode.TextDocument){
// 	// REF: https://docs.python.org/3/reference/lexical_analysis.html#encoding-declarations
//  let encodePattern = new RegExp('coding[=:]\\s*([-\\w.]+)');
// 	let match = false;
// 	for (let i = 0; i < 2; i++){
// 		let textLine = document.lineAt(i);
// 		match = encodePattern.test(textLine.text);
// 		if (match){
// 			return match;
// 		}
// 	}
// 	return match;
// }

function moveAndRevealCursor(
  editor: vscode.TextEditor,
  line: number,
  char = 0
) {
  let position = editor.selection.start.with(line, char);
  let selection = new vscode.Selection(position, position);
  editor.selection = selection;
  editor.revealRange(
    selection.with(),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport
  );
}


function wait(msec: number) {
  return new Promise((resolve) => setTimeout(resolve, msec));
}


function replaceTabWithSpace(str:string, n=4){
    return str.replace(/\t/gy, " ".repeat(n));
}


function leftAdjustTrim(lines: string[]) {
  // Remove empty lines and left trim greatest common spaces
  lines = lines.filter((item) => item.trim().length > 0);

  let start = 0;
  let isFirst = true;
  let isNewBlock = true;
  let trimLines: string[] = new Array();
  for (let line of lines) {
    // Ensure tab are handled
    line = replaceTabWithSpace(line);
    let begin = line.search(/\S|$/); // index of first non-whitespace
    isNewBlock = begin < start;
    if (isFirst) {
      // first line has hanging spaces
      start = begin;
      isFirst = false;
    }
    if (isNewBlock && !isFirst) {
      start = begin;
    }

    trimLines.push(line.substring(start));
  }
  return trimLines;
}

function getCellPattern() {
  // RegExp to find and extract spaces in front of cell flag
  let cellFlag = getConfig("CellTag") as string;
  return new RegExp(`^([\\t ]*)(?:${cellFlag})`);
}


function getPythonEditor() {
  let editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    console.error("Unable to access Active Text Editor");
    return;
  }
  if (editor.document.languageId !== "python") {
    console.error('Command only support "python" .py file');
    return;
  }
  return editor;
}

/**
 * Find cell tag line and level starting at cursor line and go toward beginning
 * of file.
 *
 * @param aLevel - desired equal or higher level of the cell to find
 * @param startLine - desired starting line, default to current cursor
 * @returns [line, level] the line the cell is found and its level
 */
function findCellAboveCursor(
  aLevel: number | undefined,
  startLine: number | undefined
) {
  let cellPattern = getCellPattern();
  let editor = getPythonEditor();
  if (editor === undefined) {
    return;
  }
  if (startLine === undefined) {
    startLine = editor.selection.start.line;
  }

  let cellLine = 0; // beginning of file or first cell
  let cellLevel = 0; // no char before cell block
  for (let iLine = startLine; iLine > 0; iLine--) {
    let line = editor.document.lineAt(iLine).text;
    let found = line.match(cellPattern);
    if (found) {
      let level = replaceTabWithSpace(found[1]).length;
      if (aLevel !== undefined && level > aLevel) {
        continue;
      }
      cellLine = iLine;
      cellLevel = level;
      break;
    }
  }
  return [cellLine, cellLevel] as const;
}

/**
 * Find cell tag line and level starting at cursor line + 1 toward end of file.
 *
 * @param aLevel - desired equal or higher level of the cell to find
 * @param startLine - desired starting line, default to current cursor
 * @returns [line, level] the line the cell is found and its level
 */
function findCellBelowCursor(
  aLevel: number | undefined,
  startLine: number | undefined
) {
  let cellPattern = getCellPattern();
  let editor = getPythonEditor();
  if (editor === undefined) {
    return;
  }
  if (startLine === undefined) {
    startLine = editor.selection.start.line;
  }
  let lineCount = editor.document.lineCount;

  let cellLine = lineCount - 1; // end of file or last cell
  let cellLevel = 0; // no char before cell block
  for (let iLine = startLine + 1; iLine < lineCount; iLine++) {
    let line = editor.document.lineAt(iLine).text;
    let found = line.match(cellPattern);
    if (found) {
      let level = replaceTabWithSpace(found[1]).length;
      if (aLevel !== undefined && level > aLevel) {
        continue;
      }
      cellLine = iLine;
      cellLevel = level;
      break;
    }
  }
  return [cellLine, cellLevel] as const;
}

// === MAIN ===
export function activate(context: vscode.ExtensionContext) {
  // Activation of this extension
  // Use the console to output diagnostic information (console.log)
  // and errors (console.error)
  // These line of code will only be executed once when extension is activated

  // Always make sure Python is available FIRST
  activatePython();

  // === LOCAL HELPERS ===
  function getIpyCommand(
    document: vscode.TextDocument,
    selection: vscode.Selection
  ) {
    let nExec = 0; // Number of execution needed on IPython console
    let cmd = "";
    document.save(); // force saving to properly use IPython %load
    // -- Single line
    if (selection.isSingleLine) {
      let text: string = "";
      if (selection.isEmpty) {
        // support: run line at cursor when empty selection
        text = document.lineAt(selection.start.line).text;
      } else {
        text = document.getText(selection.with());
      }
      cmd = `${text.trim()}`;
      nExec = 1;
      return { cmd, nExec };
    }

    // -- Stack multiple consecutive lines
    let textLines = document.getText(selection.with()).split(newLine);
    const isNotEmpty = (item: string) => item.trim().length > 0;
    let startLine = selection.start.line;
    let startIndex = textLines.findIndex(isNotEmpty);
    if (startIndex !== -1) {
      startLine += startIndex;
    } else {
      // all lines and partial lines are whitespaces
      cmd = "";
      nExec = 0;
      return { cmd, nExec };
    }
    // NOTE: will use first non-empty line and include the whole line
    // even if it is partially selected
    let start = selection.start.with(startLine, 0);
    let range = selection.with(start);

    textLines = document.getText(range).split(newLine);

    textLines = leftAdjustTrim(textLines);
    if (textLines.length > 0) {
      cmd = textLines.join(newLine);
      nExec = 1; // extra exec to handle hanging block like `else:`

      let lastIndex = textLines.length - 1;
      let firstChar = textLines[lastIndex].search(/\S|$/);
      if (firstChar > 0) {
        // last line is part of a block
        nExec = 2;
      }
      return { cmd, nExec };
    }
    return { cmd, nExec };
  }

  async function execute(
    terminal: vscode.Terminal,
    cmd: string,
    nExec: number = 1
  ) {
    if (cmd.length > 0) {
      terminal.show(true); // preserve focus

      // No newLine in sendText to execute since IPython is trippy with
      // when/how to execute a code line, block, multi-lines/blocks, etc.
      terminal.sendText(cmd, false); // false: no append `newline`
      console.log(`Command sent to terminal`);

      // Wait for IPython to register command before execution
      // in case it got stuck between each execution sent
      if (nExec > 0) {
        let execLagMilliSec = getConfig("ExecutionLagMilliSec") as number;
        console.log(`+ Number of Execution: ${nExec}`);
        for (let i = 0; i < nExec; i++) {
          await wait(execLagMilliSec);
          console.log(`- Waited ${execLagMilliSec} msec`);
          terminal.sendText(`${newLine}`);
          console.log(`- Execute ID ${i}`);
        }
      }
    }
  }

  async function createTerminal() {
    console.log("Creating IPython Terminal...");

    // -- Create and Tag IPython Terminal
    await vscode.commands.executeCommand("python.createTerminal");
    wait(200); // msec, to help with a race condition not naming terminal
    await vscode.commands.executeCommand(
      "workbench.action.terminal.renameWithArg",
      { name: terminalName }
    );
    wait(500); // msec, to help with a race condition not naming terminal

    let terminal = vscode.window.activeTerminal as vscode.Terminal;

    // Launch options
    let cmd = "ipython ";
    let launchArgs = getConfig("LaunchArguments");
    if (launchArgs !== undefined) {
      cmd += launchArgs;
    }

    // Startup options
    // REF: https://ipython.readthedocs.io/en/stable/config/intro.html#command-line-arguments
    let cmds = getConfig("StartupCommands") as any[];
    let startupCmd = "";
    if (cmds !== undefined) {
      startupCmd = " --InteractiveShellApp.exec_lines=";
      for (let c of cmds) {
        startupCmd += " --InteractiveShellApp.exec_lines=" + `'${c}'`;
      }
      cmd += startupCmd;
    }
    console.log("Startup Command: ", startupCmd);
    await execute(terminal, cmd);
    await wait(1000); // IPython may take awhile to load
    await vscode.commands.executeCommand(
      "workbench.action.terminal.scrollToBottom"
    );
    return terminal;
  }

  async function getTerminal() {
    let terminal = vscode.window.activeTerminal;
    // FIXME: use RegExp for terminalName
    if (terminal !== undefined) {
      if (terminal.name === terminalName) {
        return terminal;
      }
    }

    let terminals = vscode.window.terminals;
    if (terminals.length > 1) {
      for (let i = terminals.length - 1; i >= 0; i--) {
        if (terminals[i].name === terminalName) {
          return terminals[i];
        }
      }
    } else {
      let terminal = await createTerminal();
      if (terminal !== undefined) {
        return terminal;
      }
    }
  }

  // === COMMANDS ===
  async function runFile(
    isReset: Boolean = false,
    isWithArgs: Boolean = false,
    isWithCli: Boolean = false
  ) {
    console.log("IPython run file...");
    let editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      console.error("Unable to access Active Text Editor");
      return;
    }
    if (editor.document.languageId !== "python") {
      console.error('Command only support "python" .py file');
      return;
    }

    // let {cmd, nExec} = getIpyCommand(editor.document, undefined);
    let terminal = await getTerminal();
    if (terminal !== undefined) {
      if (isReset) {
        console.log("Reset workspace");
        await execute(terminal, `%reset -f`, 1);
      }

      let file = editor.document.fileName;
      let cmd = `"${file}"`;
      if (isWithCli) {
        let args = getConfig("CommandLineArguments") as string;
        cmd = cmd + ` ${args}`;
      }
      if (isWithArgs) {
        let args = getConfig("RunArguments") as string;
        cmd = `${args} ` + cmd;
      }
      cmd = `%run ` + cmd;
      console.log("IPython Run File Command: " + cmd);
      await execute(terminal, cmd, 1);
    }
    await vscode.commands.executeCommand(
      "workbench.action.terminal.scrollToBottom"
    );
  }

  async function runSelections() {
    console.log("IPython run selection...");
    let editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      console.error("Unable to access Active Text Editor");
      return;
    }
    if (editor.document.languageId !== "python") {
      console.error('Command only support "python" .py file');
      return;
    }

    let terminal = await getTerminal();
    if (terminal !== undefined) {
      let stackCmd = "";
      let stackExec = 1;
      for (let select of editor.selections) {
        let { cmd, nExec } = getIpyCommand(editor.document, select);
        stackExec = nExec; // NOTE: only need last
        if (cmd !== "") {
          stackCmd += newLine + cmd;
        }
      }

      if (stackCmd !== "") {
        console.log(`IPython Run Line Selection(s):${stackCmd}`);
        await execute(terminal, stackCmd.trim(), stackExec);
      }
      await vscode.commands.executeCommand(
        "workbench.action.terminal.scrollToBottom"
      );
    } else {
      console.error("Unable to get an IPython Terminal");
      return;
    }
  }

  async function runCell(isNext: boolean) {
    console.log("IPython run cell...");
    let editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      console.error("Unable to access Active Text Editor");
      return;
    }
    if (editor.document.languageId !== "python") {
      console.error('Command only support "python" .py file');
      return;
    }

    const cellAbove = findCellAboveCursor(undefined, undefined);
    if (cellAbove === undefined) {
      console.error("Failed to find Cell");
      return;
    }
    let cellStart = cellAbove[0];
    let cellLevel = cellAbove[1];

    const cellBelow = findCellBelowCursor(undefined, cellLevel);
    if (cellBelow === undefined) {
      console.error("Failed to find Cell");
      return;
    }
    let cellStop = cellBelow[0];

    let start = new vscode.Position(cellStart, 0);
    let stop = new vscode.Position(cellStop, 0);
    let selection = new vscode.Selection(start, stop);
    let { cmd, nExec } = getIpyCommand(editor.document, selection);

    if (cmd !== "") {
      // Terminal
      let terminal = await getTerminal();
      if (terminal === undefined) {
        console.error("Unable to get an IPython Terminal");
        return;
      }

      console.log("IPython Run Cell: \n" + cmd);
      await execute(terminal, cmd, nExec);
      await vscode.commands.executeCommand(
        "workbench.action.terminal.scrollToBottom"
      );
    }

    if (isNext) {
      let lineCount = editor.document.lineCount;
      let isNotLast = cellStop + 1 < lineCount;
      if (isNotLast) {
        let nextCell = cellStop + 1;
        moveAndRevealCursor(editor, nextCell);
      }
    }
  }

  async function runCursor(toFrom: string) {
    let editor = getPythonEditor();
    if (editor === undefined) {
      console.error("Failed to get editor");
      return;
    }
    let anchor: vscode.Position;
    let active: vscode.Position;
    let line = editor.selection.start.line;
    if (toFrom === "top") {
      anchor = new vscode.Position(0, 0);
      active = editor.selection.start.with(line, 0);
    } else if (toFrom === "bottom") {
      anchor = editor.selection.start.with(line, 0);
      active = new vscode.Position(editor.document.lineCount, 0);
    } else {
      console.error(`Invalid option "toFrom": ${toFrom}`);
      return;
    }

    let selection = new vscode.Selection(anchor, active);

    let { cmd, nExec } = getIpyCommand(editor.document, selection);
    if (cmd !== "") {
      let terminal = await getTerminal();
      if (terminal !== undefined) {
        await execute(terminal, cmd, nExec);
        await vscode.commands.executeCommand(
          "workbench.action.terminal.scrollToBottom"
        );
      } else {
        console.error("Failed to get terminal");
        return;
      }
    }
  }

  function moveCursorToCell(next: Boolean) {
    let editor = getPythonEditor();
    if (editor === undefined) {
      console.error("Unable to get editor");
      return;
    }
    let line = editor.selection.start.line;
    let cellLine: number;

    if (next) {
      if (line < editor.document.lineCount - 1) {
        line += 1;
      }
      const cellBelow = findCellBelowCursor(undefined, line);
      if (cellBelow === undefined) {
        console.error("Failed to find cell above");
        return;
      }
      cellLine = cellBelow[0];
    } else {
      if (line > 0) {
        line -= 1;
      }
      const cellAbove = findCellAboveCursor(undefined, line);
      if (cellAbove === undefined) {
        console.error("Failed to find cell above");
        return;
      }
      cellLine = cellAbove[0];
    }
    let cellPattern = getCellPattern();
    let text = editor.document.lineAt(cellLine).text;
    let found = text.match(cellPattern);
    let char = 0;
    if (found){
        char = found[1].length;
    }
    moveAndRevealCursor(editor, cellLine, char);
  }

  // -- Register Command to Extension
  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.moveToPreviousCell", () =>
      moveCursorToCell(false)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.moveToNextCell", () =>
      moveCursorToCell(true)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.createTerminal", createTerminal)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.runFile", runFile)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.runFileWithArgs", () =>
      runFile(false, true, false)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.runFileWithCli", () =>
      runFile(false, false, true)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.runFileWithArgsCli", () =>
      runFile(false, true, true)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.resetAndRunFile", () =>
      runFile(true, false, false)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.resetAndRunFileWithArgs", () =>
      runFile(true, true, false)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.resetAndRunFileWithCli", () =>
      runFile(true, false, true)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.resetAndRunFileWithArgsCli", () =>
      runFile(true, true, true)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.runSelections", runSelections)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.runCell", runCell)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.runCellAndMoveToNext", () =>
      runCell(true)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.runToLine", () => runCursor("top"))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("ipython.runFromLine", () =>
      runCursor("bottom")
    )
  );

  // -- FIXME: Keybinding `when clause`
  vscode.commands.executeCommand("setContext", "ipython.isUse", true);
}

// this method is called when your extension is deactivated
export function deactivate() {}
