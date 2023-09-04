import * as vscode from "vscode";
import * as path from "path";

import * as util from "./utility";
import * as cst from "./constants";

// === CONSTANTS ===
let newLine = util.getNewLine();
export const terminalName = "IPython";  //TODO: consider making configurable?!

// TODO: make configurable?
// REF: https://www.dofactory.com/css/
const sectionDecorType = vscode.window.createTextEditorDecorationType({
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
 * @returns active python text editor
 */
export function getPythonEditor() {
    let editor = vscode.window.activeTextEditor as vscode.TextEditor;

    if (editor.document.languageId !== "python") {
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
    if (!pyExtension.isActive){
        await pyExtension.activate();
    }
    let editor = getPythonEditor();
    decorateSection(editor);
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
 * Move the cursor to location and reveal its editor
 *
 * @param editor - a text editor
 * @param line - line number of location
 * @param char - character number of location
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
 * Remove empty lines, left trim greatest common spaces, trim ends.
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
            // First line has hanging spaces
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
 * Pattern to look for code section.
 *
 * @returns pattern - regular expression to find section tag capture tab and space
 * before it in a line
 */
export function getSectionPattern() {
    let sectionFlag = getConfig("SectionTag") as string;
    // NOTE: find section tag, capture tab and space before tag in a line
    return new RegExp(`(?:^([\\t ]*)${sectionFlag.trim()})`);
}

/**
 * Find section tag line and level starting at cursor line and go toward
 * beginning of file.
 *
 * @param startLine - desired starting line, default to current cursor
 * @param aLevel - desired equal or higher level of the section to find.
 * Set `undefine` to find nearest.
 * @returns [line, level] the line the section is found and its level
 */
export function findSectionAboveCursor(
    startLine: number | undefined,
    aLevel: number | undefined
) {
    let sectionPattern = getSectionPattern();
    let editor = getPythonEditor();
    if (editor === undefined) {
        return;
    }
    if (startLine === undefined) {
        startLine = editor.selection.start.line;
    }

    let sectionLine = 0; // beginning of file or first section
    let sectionLevel = 0; // no char before section block
    for (let iLine = startLine; iLine > 0; iLine--) {
        let line = editor.document.lineAt(iLine).text;
        let found = line.match(sectionPattern);
        if (found) {
            let level = util.replaceTabWithSpace(found[1]).length;
            if (aLevel !== undefined && level > aLevel) {
                continue;
            }
            sectionLine = iLine;
            sectionLevel = level;
            break;
        }
    }
    return [sectionLine, sectionLevel] as const;
}

/**
 * Find section tag line and level starting at cursor line + 1 toward end of file.
 *
 * @param startLine - desired starting line, default to current cursor
 * @param aLevel - desired equal or higher level of the section to find.
 * Set `undefine` to find nearest.
 * @returns [line, level] the line the section is found and its level
 */
export function findSectionBelowCursor(
    startLine: number | undefined,
    aLevel: number | undefined
) {
    let sectionPattern = getSectionPattern();
    let editor = getPythonEditor();
    if (editor === undefined) {
        return;
    }
    if (startLine === undefined) {
        startLine = editor.selection.start.line;
    }
    let lineCount = editor.document.lineCount;

    let sectionLine = lineCount - 1; // end of file or last section
    let sectionLevel = 0; // no char before section block
    for (let iLine = startLine; iLine < lineCount; iLine++) {
        let line = editor.document.lineAt(iLine).text;
        let found = line.match(sectionPattern);
        if (found) {
            let level = util.replaceTabWithSpace(found[1]).length;
            if (aLevel !== undefined && level > aLevel) {
                continue;
            }
            sectionLine = iLine;
            sectionLevel = level;
            break;
        }
    }
    return [sectionLine, sectionLevel] as const;
}

/**
 * Find section tag in current active text editor.
 *
 * @returns positions of section tag
 */
export function findSections() {
    let sectionFlag = getConfig("SectionTag") as string;
    let editor = getPythonEditor() as vscode.TextEditor;

    // NOTE: find section tag without capture, gm: global, multiline
    let pattern = new RegExp(`(?:^[\\t ]*${sectionFlag.trim()})`, 'gm');

    let text = editor.document.getText();
    let matches = text.matchAll(pattern);

    let positions: vscode.Position[] = [];
    for (let match of matches) {
        if (match.index === undefined) {
            continue;
        }
        let position = editor.document.positionAt(match.index);
        positions.push(position);
    }
    return positions;
}

/**
 * Decorate section with divider.
 *
 * @param editor - current active python editor
 * @returns - undefined when failed
 */
export function decorateSection(editor: vscode.TextEditor | undefined) {
    if (editor === undefined) {
        return;
    }
    if (editor.document.languageId !== "python") {
        util.consoleLog('Command only support "python" .py file');
        return;
    }
    let positions = findSections();

    const decors: vscode.DecorationOptions[] = [];
    for (let position of positions){
        decors.push({
            range: new vscode.Range(position, position),
        });
    }
    editor.setDecorations(sectionDecorType, decors);
}

/**
 * Update section decoration
 * @param editor - current active python editor
 */
export function updateSectionDecor(editor: vscode.TextEditor | undefined) {
    setTimeout(decorateSection, cst.MAX_TIMEOUT);
    decorateSection(editor);
}

/**
 * Write code to file.
 *
 * @param filename - name of file to write code to
 * @param code - properly formatted code
 * @returns workspace relative path to written file
 */
export function writeCodeFile(filename: string, code: string) {
    // -- Write File
    let wsFolders = vscode.workspace.workspaceFolders; // Assume single workspace
    if (wsFolders === undefined) {
        console.error("Workspace folder not found");
        return;
    }

    let folder = wsFolders[0].uri.fsPath;
    let relName = path.join(cst.WORK_FOLDER, filename);
    let file = vscode.Uri.file(path.join(folder, relName));

    util.consoleLog(`Write File: ${file}`);

    // NOTE: extra newline for indented code at end of file
    let cmd = Buffer.from(code, "utf8");
    vscode.workspace.fs.writeFile(file, cmd);
    // fs.writeFileSync(file, command + "\n");

    return relName;
}

/**
 * Move cursor to a section above or below
 * @param below - look below or above
 */
export function moveCursorToSection(below: boolean) {
    let editor = getPythonEditor();
    if (editor === undefined) {
        console.error("Unable to get editor");
        return;
    }
    let line = editor.selection.start.line;
    let sectionLine: number;

    if (below) {
        if (line < editor.document.lineCount - 1) {
            line += 1;
        }
        const sectionBelow = findSectionBelowCursor(line, undefined);
        if (sectionBelow === undefined) {
            console.error("Failed to find section above");
            return;
        }
        sectionLine = sectionBelow[0];
    } else {
        if (line > 0) {
            line -= 1;
        }
        const sectionAbove = findSectionAboveCursor(line, undefined);
        if (sectionAbove === undefined) {
            console.error("Failed to find section above");
            return;
        }
        sectionLine = sectionAbove[0];
    }
    let sectionPattern = getSectionPattern();
    let text = editor.document.lineAt(sectionLine).text;
    let found = text.match(sectionPattern);
    let char = 0;
    if (found) {
        char = found[1].length;
    }
    moveAndRevealCursor(editor, sectionLine, char);
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
    util.wait(500); // msec, to help with a race condition of not naming terminal
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
    await executeSingleLine(terminal, cmd);
    await util.wait(500);  // may take awhile to startup ipython
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
    }

    terminal = await createTerminal();
    if (terminal !== undefined) {
        return terminal;
    }

}

/**
 * Format single line or consecutive lines of code to fit ipython terminal.
 *
 * NOTE: always return code with empty newline like newline at end of file.
 *
 * @param document - current active python file
 * @param selection - a selection in python file
 * @returns code - executable on ipython terminal
 */
export function formatCode(
    document: vscode.TextDocument,
    selection: vscode.Selection
) {
    let code = "";
    document.save(); // force saving to properly get text

    if (selection.isSingleLine) {
        let text: string = "";
        if (selection.isEmpty) {
            // Support run line at cursor when empty selection
            text = document.lineAt(selection.start.line).text;
        } else {
            text = document.getText(selection.with());
        }
        code = text.trim() + newLine;
        return code;
    }

    // -- Format & Stack
    let textLines = document.getText(selection.with()).split(newLine);
    const isNotEmpty = (item: string) => item.trim().length > 0;
    let startLine = selection.start.line;
    let startIndex = textLines.findIndex(isNotEmpty);
    if (startIndex !== -1) {
        startLine += startIndex;
    } else {  // all lines and partial lines are whitespaces
        code = "" + newLine;
        return code;
    }

    // NOTE: use first non-empty line and include the whole line even if it is
    // partially selected
    let start = selection.start.with(startLine, 0);
    let range = selection.with(start);

    textLines = document.getText(range).split(newLine);

    textLines = leftAdjustTrim(textLines);
    if (textLines.length > 0) {
        code = textLines.join(newLine);

        // let lastIndex = textLines.length - 1;
        // let firstChar = textLines[lastIndex].search(/\S|$/);
        // if (firstChar > 0) { // last line is part of a block
        //     code += newLine;
        // }
    }
    return code + newLine;
}


/**
 * Execute a block of code.
 *
 * @param terminal - an ipython terminal
 * @param code - block of code
 * @param identity - of block
 */
export async function executeCodeBlock(
    terminal: vscode.Terminal,
    code: string,
    identity: string = ''
) {
    let file = writeCodeFile(cst.CODE_FILE, code);

    let nExec = 1;  // default to %run -i
    let execMethod = getConfig('RunCodeBlockMethod') as string;
    let command = `${execMethod} "${file}"`;

    if (execMethod === '%run -i'){
        command += `  ${identity}`;
    } else {  // assume %load
        nExec = 2;
    }
    await executeSingleLine(terminal, command);
}


/**
 * Execute single line command.
 *
 * @param terminal - an ipython terminal
 * @param command - a command
 * @param Promise - executed on terminal
 */
export async function executeSingleLine(
    terminal: vscode.Terminal,
    command: string,
) {
    command = command.trim();

    if (command.length === 0){
        return;
    }

    // NOTE: no newLine in sendText to execute since IPython is trippy
    // with when/how to execute a code line, block, multi-lines/blocks.
    terminal.sendText(command, false); // false: no append `newline`
    await execute(terminal);
}

/**
 * Execute code that are already sent to an ipython terminal.
 *
 * @param terminal - an ipython terminal
 * @param nExec - number of ipython execution
 * @param Promise - executed on terminal
 */
async function execute(terminal: vscode.Terminal, nExec=1){
   // Wait for IPython to register command before execution.
    // NOTE: this helps with race condition, not solves it.
    if (nExec === 0) {
        return;
    }

    let execLagMilliSec = getConfig("ExecutionLagMilliSec") as number;
    util.consoleLog(`+ Number of Execution: ${nExec}`);
    for (let i = 0; i < nExec; i++) {
        await util.wait(execLagMilliSec);
        util.consoleLog(`- Waited ${execLagMilliSec} msec`);
        terminal.sendText('');
        util.consoleLog(`- Execute ID ${i}`);
    }

    await vscode.commands.executeCommand(
        "workbench.action.terminal.scrollToBottom"
    );
    terminal.show(true);
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
    isWithArgs: boolean = false,
    isWithCli: boolean = false
) {
    util.consoleLog("IPython run file...");
    let editor = getPythonEditor() as vscode.TextEditor;
    await editor.document.save();

    let terminal = await getTerminal() as vscode.Terminal;

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
    await executeSingleLine(terminal, cmd);
}

/**
 * Run a selection of python code in an ipython terminal.
 *
 * @returns Promise - is ran in terminal
 */
export async function runSelections() {
    util.consoleLog("IPython run selection...");
    let editor = getPythonEditor() as vscode.TextEditor;
    let terminal = await getTerminal() as vscode.Terminal;

    let codes:string[] = [];
    for (let select of editor.selections) {
        let code = formatCode(editor.document, select);
        let lines = code.trimEnd().split(newLine);
        for (let line of lines) {
            codes.push(line);
        }
    }
    let isSingleLine = codes.length === 1;
    let code = codes.join(newLine) + newLine;

    util.consoleLog(`IPython Run Line Selection(s):${code}`);
    if (isSingleLine){
        await executeSingleLine(terminal, code);
        return;
    }
    let identity = '# selection(s)';
    await executeCodeBlock(terminal, code, identity);
}

/**
 * Run current line of code and move cursor to next line.
 *
 * @returns Promise - executed in terminal
 */
export async function runLine() {
    util.consoleLog("IPython run a line...");
    let editor = getPythonEditor() as vscode.TextEditor;

    if (!editor.selection.isSingleLine && !editor.selection.isEmpty) {
        runSelections();
        return;
    }

    let terminal = await getTerminal();
    if (terminal === undefined) {
        console.error("Unable to get an IPython Terminal");
        return;
    }

    let cmd = formatCode(editor.document, editor.selection);
    if (cmd !== "") {
        util.consoleLog(`IPython Run Line :${cmd}`);
        await executeSingleLine(terminal, cmd);
    }

    let line = editor.selection.start.line + 1;
    moveAndRevealCursor(editor, line);
}

/**
 * Run current section of python code in an ipython terminal.
 *
 * @param isNext - move cursor to next section if any
 * @returns Promise - is ran in terminal
 */
export async function runSection(isNext: boolean) {
    util.consoleLog("IPython run section...");
    let editor = getPythonEditor();
    if (editor === undefined) {
        console.error("Unable to access Active Text Editor");
        return;
    }
    // FIXME: probably an easier way of doing this using regular expression
    // Find section immediately at or above current cursor
    let line = editor.selection.start.line;
    const sectionAbove = findSectionAboveCursor(line, undefined);
    if (sectionAbove === undefined) {
        console.error("Failed to find Section");
        return;
    }
    let sectionStart = sectionAbove[0];
    let sectionLevel = sectionAbove[1];

    // Find section below current cursor with same level as above section
    let lineCount = editor.document.lineCount;
    if (line < lineCount - 1) {
        line += 1;
    }
    const sectionBelow = findSectionBelowCursor(line, sectionLevel);
    if (sectionBelow === undefined) {
        console.error("Failed to find Section");
        return;
    }
    let sectionStop = sectionBelow[0];  // one line below last line

    let start = new vscode.Position(sectionStart, 0);
    let stop = new vscode.Position(sectionStop, 0);
    let selection = new vscode.Selection(start, stop);

    let sectionName = '#';  // empty python comment
    if (sectionStart > 0){
        sectionName = editor.document.lineAt(sectionStart).text.trim();
    }

    // NOTE: editor is 1-indexing
    let identity = `${sectionName} (Line ${sectionStart + 1}:${sectionStop})`;
    let code = formatCode(editor.document, selection);

    if (code !== "") {
        let terminal = await getTerminal();
        if (terminal === undefined) {
            console.error("Unable to get an IPython Terminal");
            return;
        }

        util.consoleLog("IPython Run Section: \n" + code);
        await executeCodeBlock(terminal, code, identity);
    }

    if (isNext) {
        if (sectionStop < lineCount - 1) {
            let sectionPattern = getSectionPattern();
            let text = editor.document.lineAt(sectionStop).text;
            let found = text.match(sectionPattern);
            let char = 0;
            if (found) {
                char = found[1].length;
            }
            moveAndRevealCursor(editor, sectionStop, char);
        }
    }
}

/**
 * Run code to or from cursor.
 *
 * @param toEnd - inclusively from top to line or from line to end of file
 * @returns Promise - is ran in terminal
 */
export async function runCursor(toEnd: boolean) {
    let editor = getPythonEditor() as vscode.TextEditor;

    // Default to beginning of file
    let startLine = 0;
    // let startChar = 0;

    // Default to current line
    let stopLine = editor.selection.start.line;
    // let stopChar = editor.document.lineAt(stopLine).text.length - 1;

    if (toEnd) {  // to bottom
        startLine = editor.selection.start.line;
        stopLine = editor.document.lineCount - 1;
        // stopChar = editor.document.lineAt(stopLine).text.length - 1;
    }
    // let startPosition = new vscode.Position(startLine, startChar);
    // let stopPosition = new vscode.Position(stopLine, stopChar);
    let startPosition = new vscode.Position(startLine, 0);
    let stopPosition = new vscode.Position(stopLine, 0);
    let selection = new vscode.Selection(startPosition, stopPosition);

    let name = path.basename(editor.document.fileName);
    // NOTE: editor display line is 1-indexing
    let start = selection.start.line + 1;
    let end = selection.end.line + 1;
    let identity = `# ${name} Line ${start}:${end}`;

    let code = formatCode(editor.document, selection);
    if (code !== "") {
        let terminal = await getTerminal() as vscode.Terminal;
        await executeCodeBlock(terminal, code, identity);
    }
}
