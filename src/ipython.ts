import * as vscode from "vscode";
import * as path from "path";

import * as util from "./utility";
import * as cst from "./constants";

// === CONSTANTS ===
let newLine = util.getNewLine()
export const terminalName = "IPython";  //TODO: consider making configurable?!

// TODO: make configurable?
// REF: https://www.dofactory.com/css/
const cellDecorType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    borderWidth: '1px 0 0 0',
    borderStyle: 'dotted',  // 'groove',  // 'dashed',
    borderColor: 'inherit',  // 'LightSlateGray',
    fontWeight: 'bolder',
    fontStyle: 'italic',
});

// === MISC ===

/**
 * Get current editor.
 *
 * @returns - active python text editor
 */
export function getPythonEditor() {
    let editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
        util.consoleLog("Unable to access Active Text Editor");
        return;
    }
    if (editor.document.languageId !== "python") {
        util.consoleLog('Command only support "python" .py file');
        return;
    }
    return editor;
}

/**
 * Activate parent extensions.
 */
export async function activatePython() {
    // FIXME: use official ms-python hook instead!?
    let pyExtension = vscode.extensions.getExtension("ms-python.python");
    if (pyExtension === undefined) {
        console.error("Failed to get MS-Python Extension");
        return;
    }
    await pyExtension.activate();
    let editor = getPythonEditor();
    decorateCell(editor);
}

/**
 * Get extension configuration.
 *
 * @param name - configuration name
 * @returns - configuration value
 */
export function getConfig(name: string) {
    return vscode.workspace.getConfiguration("ipython").get(name);
}

/**
 * Move the cursor to location and reveal it editor
 *
 * @param editor - a text editor
 * @param line - line number of cursor
 * @param char - character number of cursor
 */
export function moveAndRevealCursor(
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

/**
 * Remove empty lines, left trim greatest common spaces, right trim spaces,
 * and newline
 *
 * @param lines - of strings
 * @returns trimLines - trimmed line of string
 */
export function leftAdjustTrim(lines: string[]) {
    lines = lines.filter((item) => item.trim().length > 0);

    let start = 0;
    let isFirst = true;
    let isNewBlock = true;
    let trimLines: string[] = new Array();
    for (let line of lines) {
        // Ensure tab are handled
        line = util.replaceTabWithSpace(line);
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

        trimLines.push(line.substring(start).trimEnd());
    }
    return trimLines;
}

// === CELL ===

/**
 * Pattern to look for code cell.
 *
 * @returns pattern - regular expression to find cell tag capture tab and space
 * before it in a line
 */
export function getCellPattern() {
    let cellFlag = getConfig("CellTag") as string;
    // NOTE: find cell tag, capture tab and space before it in a line
    return new RegExp(`(?:^([\\t ]*)${cellFlag.trim()})`);
    // return new RegExp(`^([\\t ]*)(?:${cellFlag})`);  // (?:^([\t ]*)# %% )
}

/**
 * Find cell tag line and level starting at cursor line and go toward beginning
 * of file.
 *
 * @param startLine - desired starting line, default to current cursor
 * @param aLevel - desired equal or higher level of the cell to find.
 * Set `undefine` to find nearest.
 * @returns [line, level] the line the cell is found and its level
 */
export function findCellAboveCursor(
    startLine: number | undefined,
    aLevel: number | undefined
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
            let level = util.replaceTabWithSpace(found[1]).length;
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
 * @param startLine - desired starting line, default to current cursor
 * @param aLevel - desired equal or higher level of the cell to find.
 * Set `undefine` to find nearest.
 * @returns [line, level] the line the cell is found and its level
 */
export function findCellBelowCursor(
    startLine: number | undefined,
    aLevel: number | undefined
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
    for (let iLine = startLine; iLine < lineCount; iLine++) {
        let line = editor.document.lineAt(iLine).text;
        let found = line.match(cellPattern);
        if (found) {
            let level = util.replaceTabWithSpace(found[1]).length;
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
 * regex matching cell tag in current active editor .py
 *
 * @returns matches - regular expression matching cell tag position
 */
export function findCells() {
    let cellFlag = getConfig("CellTag") as string;
    let editor = getPythonEditor();
    if (editor === undefined) {
        return undefined;
    }
    // NOTE: find cell tag without capture, gm: global, multiline
    let pattern = new RegExp(`(?:^[\\t ]*${cellFlag.trim()})`, 'gm');

    let text = editor.document.getText();
    return text.matchAll(pattern);
}

/**
 * Decorate cell with divider.
 *
 * @param editor - current active python editor
 * @returns - undefined when failed
 */
export function decorateCell(editor: vscode.TextEditor | undefined) {
    if (editor === undefined) {
        return;
    }
    if (editor.document.languageId !== "python") {
        util.consoleLog('Command only support "python" .py file');
        return;
    }
    let matches = findCells();
    if (matches === undefined) {
        return;
    }

    const decors: vscode.DecorationOptions[] = [];
    for (let match of matches) {
        if (match.index === undefined) {
            continue;
        }
        let position = editor.document.positionAt(match.index);
        decors.push({
            range: new vscode.Range(position, position),
        });
    }
    editor.setDecorations(cellDecorType, decors);
}

/**
 * Update cell decoration
 * @param editor - current active python editor
 */
export function updateCellDecor(editor: vscode.TextEditor | undefined) {
    setTimeout(decorateCell, cst.MAX_TIMEOUT);
    decorateCell(editor);
}

export function writeCommandFile(filename: string, command: string) {
    // -- Write File
    let wsFolders = vscode.workspace.workspaceFolders; // Assume single workspace
    if (wsFolders === undefined) {
        console.error("Workspace folder not found");
        return;
    }

    let folder = wsFolders[0].uri.fsPath;
    let relName = path.join("./", ".vscode", "ipython", filename);
    // let file = path.join(folder, relName);
    let file = vscode.Uri.file(path.join(folder, relName));

    util.consoleLog(`Write File: ${file}`);

    // NOTE: extra newline for indented code at end of file
    let cmd = Buffer.from(command + "\n\n", "utf8");
    vscode.workspace.fs.writeFile(file, cmd);
    // fs.writeFileSync(file, command + "\n");

    return relName;
}

/**
 * Move cursor to a cell above or below
 * @param below - look below or above
 */
export function moveCursorToCell(below: boolean) {
    let editor = getPythonEditor();
    if (editor === undefined) {
        console.error("Unable to get editor");
        return;
    }
    let line = editor.selection.start.line;
    let cellLine: number;

    if (below) {
        if (line < editor.document.lineCount - 1) {
            line += 1;
        }
        const cellBelow = findCellBelowCursor(line, undefined);
        if (cellBelow === undefined) {
            console.error("Failed to find cell above");
            return;
        }
        cellLine = cellBelow[0];
    } else {
        if (line > 0) {
            line -= 1;
        }
        const cellAbove = findCellAboveCursor(line, undefined);
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
    if (found) {
        char = found[1].length;
    }
    moveAndRevealCursor(editor, cellLine, char);
}

// === TERMINAL ===

/**
 * Create an ipython terminal.
 *
 * @returns terminal - an ipython terminal
 */
export async function createTerminal() {
    util.consoleLog("Creating IPython Terminal...");

    // -- Create and Tag IPython Terminal
    await vscode.commands.executeCommand("python.createTerminal");
    util.wait(500); // msec, to help with a race condition not naming terminal
    await vscode.commands.executeCommand(
        "workbench.action.terminal.renameWithArg",
        { name: terminalName }
    );
    util.wait(500); // msec, to help with a race condition not naming terminal

    let terminal = vscode.window.activeTerminal as vscode.Terminal;

    // Launch options
    let cmd = "ipython ";
    let launchArgs = getConfig("LaunchArguments") as string;

    let args = launchArgs.split(" ");
    for (let arg of args) {
        let s = arg.trim();
        if (s.length === 0) {
            continue;
        }
        cmd += s + " ";
    }

    // Startup options
    // REF: https://ipython.readthedocs.io/en/stable/config/intro.html#command-line-arguments
    let cmds = getConfig("StartupCommands") as string[];
    let startupCmd = "";

    for (let c of cmds) {
        let s = c.trim();
        if (s.length === 0) {
            continue;
        }
        startupCmd += "--InteractiveShellApp.exec_lines=" + `'${s}' `;
    }
    cmd += startupCmd;

    util.consoleLog(`Startup Command: ${startupCmd}`);
    await execute(terminal, cmd, 1, true);
    await util.wait(500); // IPython may take awhile to load. FIXME: move to config
    await vscode.commands.executeCommand(
        "workbench.action.terminal.scrollToBottom"
    );
    return terminal;
}

/**
 * Get a created ipython terminal.
 *
 * @returns terminal - an ipython terminal
 */
export async function getTerminal() {
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

/**
 * Ipython terminal specific command and execution for use with `execute()`
 * @param document - current active python file
 * @param selection - a selection in python file
 * @returns cmd, nExec - command string and number of executions in terminal
 */
export function getIpyCommand(
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
        if (firstChar > 0) { // last line is part of a block
            nExec = 2;
        }
        return { cmd, nExec };
    }
    return { cmd, nExec };
}

/**
 * Execute ipython command on terminal.
 *
 * @param terminal - an ipython terminal
 * @param cmd - a command
 * @param nExec - number of executions
 * @param isSingleLine - a single line or multi-line command
 * @returns - undefined when unable
 */
export async function execute(
    terminal: vscode.Terminal,
    cmd: string,
    nExec: number = 1,
    isSingleLine: boolean
) {
    if (cmd.length > 0) {
        terminal.show(true); // preserve focus

        if (isSingleLine) {
            // No newLine in sendText to execute since IPython is trippy with
            // when/how to execute a code line, block, multi-lines/blocks, etc.
            terminal.sendText(cmd, false); // false: no append `newline`
        } else {
            let sendMethod = getConfig("SendCommandMethod") as string;

            if (sendMethod === "file") {
                // let filename = ".vscode/ipython/temp_command.py";
                let filename = "command.py";
                let file = writeCommandFile(filename, cmd);
                // NOTE: require quotation "${file}" to properly load in all cases
                terminal.sendText(`%load "${file}" `);
                nExec = 2; // %load command requires 2 newlines after loading to excute
            } else if (sendMethod === "clipboard") {
                util.consoleLog(`--Use clipboard for command--`);
                let clip = await vscode.env.clipboard.readText();
                await vscode.env.clipboard.writeText(cmd);
                await vscode.commands.executeCommand(
                    "workbench.action.terminal.paste"
                );
                await vscode.env.clipboard.writeText(clip);
                let editor = vscode.window.activeTextEditor;
                if (editor === undefined) {
                    return;
                }
                await vscode.window.showTextDocument(editor.document);
            }
        }
        util.consoleLog(`Command sent to terminal`);

        // Wait for IPython to register command before execution.
        // NOTE: this helps with command race condition, not solves it.
        if (nExec > 0) {
            let execLagMilliSec = getConfig("ExecutionLagMilliSec") as number;
            util.consoleLog(`+ Number of Execution: ${nExec}`);
            for (let i = 0; i < nExec; i++) {
                await util.wait(execLagMilliSec);
                util.consoleLog(`- Waited ${execLagMilliSec} msec`);
                terminal.sendText(`${newLine}`);
                util.consoleLog(`- Execute ID ${i}`);
            }
        }
    }
}


// === COMMANDS ===
/**
 * Run a python file in an ipython terminal.
 *
 * @param isReset - with reset command to terminal
 * @param isWithArgs - with specific run arguments
 * @param isWithCli - run with command line interface arguments
 * @returns Promise - is ran in terminal
 */
export async function runFile(
    isReset: boolean = false,
    isWithArgs: boolean = false,
    isWithCli: boolean = false
) {
    util.consoleLog("IPython run file...");
    let editor = vscode.window.activeTextEditor;
    await editor?.document.save();
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
            util.consoleLog("Reset workspace");
            await execute(terminal, `%reset -f`, 1, true);
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
        util.consoleLog("IPython Run File Command: " + cmd);
        await execute(terminal, cmd, 1, true);
    }
    await vscode.commands.executeCommand(
        "workbench.action.terminal.scrollToBottom"
    );
}

/**
 * Run a selection of python code in an ipython terminal.
 *
 * @returns Promise - is ran in terminal
 */
export async function runSelections() {
    util.consoleLog("IPython run selection...");
    let editor = getPythonEditor();
    if (editor === undefined) {
        console.error("Unable to access Active Text Editor");
        return;
    }

    let terminal = await getTerminal();
    if (terminal === undefined) {
        console.error("Unable to get an IPython Terminal");
        return;
    }

    let stackCmd = "";
    let stackExec = 1;
    for (let select of editor.selections) {
        let { cmd, nExec } = getIpyCommand(editor.document, select);
        stackExec = nExec; // NOTE: only need last
        if (cmd !== "") {
            stackCmd += newLine + cmd;
        }
    }
    stackCmd = stackCmd.trim();
    let isSingleLine = stackCmd.indexOf(newLine) === -1;
    if (stackCmd !== "") {
        util.consoleLog(`IPython Run Line Selection(s):${stackCmd}`);
        await execute(terminal, stackCmd, stackExec, isSingleLine);
    }

    await vscode.commands.executeCommand(
        "workbench.action.terminal.scrollToBottom"
    );

}

/**
 * Run current line of python code in an ipython terminal.
 *
 * @returns Promise - is ran in terminal
 */
export async function runLine() {
    util.consoleLog("IPython run a line...");
    let editor = getPythonEditor();
    if (editor === undefined) {
        console.error("Unable to access Active Text Editor");
        return;
    }

    if (!editor.selection.isSingleLine && !editor.selection.isEmpty) {
        util.consoleLog('More than one selections or a line with a selection of char');
        runSelections();
        return;
    }

    let terminal = await getTerminal();
    if (terminal === undefined) {
        console.error("Unable to get an IPython Terminal");
        return;
    }

    let { cmd, nExec } = getIpyCommand(editor.document, editor.selection);
    if (cmd !== "") {
        util.consoleLog(`IPython Run Line :${cmd}`);
        await execute(terminal, cmd, nExec, editor.selection.isSingleLine);
    }

    let line = editor.selection.start.line + 1;
    moveAndRevealCursor(editor, line);
}

/**
 * Run current cell of python code in an ipython terminal.
 *
 * @param isNext - move cursor to next cell if any
 * @returns Promise - is ran in terminal
 */
export async function runCell(isNext: boolean) {
    util.consoleLog("IPython run cell...");
    let editor = getPythonEditor();
    if (editor === undefined) {
        console.error("Unable to access Active Text Editor");
        return;
    }

    // Find cell immediately at or above current cursor
    let line = editor.selection.start.line;
    const cellAbove = findCellAboveCursor(line, undefined);
    if (cellAbove === undefined) {
        console.error("Failed to find Cell");
        return;
    }
    let cellStart = cellAbove[0];
    let cellLevel = cellAbove[1];

    // Find cell below current cursor with same level as above cell
    let lineCount = editor.document.lineCount;
    if (line < lineCount - 1) {
        line += 1;
    }
    const cellBelow = findCellBelowCursor(line, cellLevel);
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

        util.consoleLog("IPython Run Cell: \n" + cmd);
        await execute(terminal, cmd, nExec, false);
        await vscode.commands.executeCommand(
            "workbench.action.terminal.scrollToBottom"
        );
    }

    if (isNext) {
        if (cellStop < lineCount - 1) {
            let cellPattern = getCellPattern();
            let text = editor.document.lineAt(cellStop).text;
            let found = text.match(cellPattern);
            let char = 0;
            if (found) {
                char = found[1].length;
            }
            moveAndRevealCursor(editor, cellStop, char);
        }
    }
}

/**
 * Run code to or from cursor.
 *
 * @param toFrom - inclusively from top to line or from line to end of file
 * @returns Promise - is ran in terminal
 */
export async function runCursor(toFrom: string) {
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
        if (terminal === undefined) {
            console.error("Failed to get terminal");
            return;
        }
        await execute(terminal, cmd, nExec, selection.isSingleLine);
        await vscode.commands.executeCommand(
            "workbench.action.terminal.scrollToBottom"
        );
    }
}
