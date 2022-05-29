// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// === CONSTANTS ===

let newLine:string = '\n';  // default to eol === 1
let editor = vscode.window.activeTextEditor;
if (editor !== undefined) {
	let eol = editor.document.eol;
	if (eol === 2) {
		newLine = '\r\n';
	}
}

let terminalPrefix = 'IPython';  // for the name of the terminal window.

// === FUNCTIONS ===
async function activatePython() {
	let pyExtension = vscode.extensions.getExtension('ms-python.python');
	if (pyExtension === undefined) {
		console.error('Failed to get MS-Python Extension');
		return;
	}
	await pyExtension.activate();
}

function moveAndRevealCursor(line: number, editor: vscode.TextEditor) {
	let position = editor.selection.start.with(line, 0);
	let cursor = new vscode.Selection(position, position);
	editor.selection = cursor;
	editor.revealRange(cursor.with(), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

function wait(msec: number) {
	return new Promise(resolve => setTimeout(resolve, msec));
}

// === MAIN ===
export function activate(context: vscode.ExtensionContext) {
	// Activation of this extension
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// These line of code will only be executed once when extension is activated

	// Always make sure Python is available for use FIRST
	activatePython();


	// Configuration handling
	let cellPattern: RegExp;
	let uniqueTerminals: boolean;
	let terminalDelayMsec: number;
	let ipythonDelayMsec: number;
	let execDelayPer100CharsMsec: number;
	let minExecDelayMsec: number;
	let launchArgs: string;
	let startupCmds: string[];
	function updateConfig() {
		console.log('Updating configuration...');
		let config = vscode.workspace.getConfiguration('ipython');
		let cellFlag = config.get('cellTag') as string;
		cellPattern = new RegExp(`^(?:${cellFlag.replace(' ', '\\s*')})`);
		uniqueTerminals = config.get('oneTerminalPerFile') as boolean;
		terminalDelayMsec = config.get('delays.terminalDelayMilliseconds') as number;
		ipythonDelayMsec = config.get('delays.ipythonDelayMilliseconds') as number;
		execDelayPer100CharsMsec = config.get('delays.executionDelayPer100CharactersMilliseconds') as number;
		minExecDelayMsec = config.get('delays.minimumExecutionDelayMilliseconds') as number;
		launchArgs = config.get('launchArguments') as string;
		startupCmds = config.get('startupCommands') as string[];
	}

	// === LOCAL HELPERS ===
	async function execute(terminal: vscode.Terminal, cmd: string) {
		// There is a fundamental issue here.
		// `terminal.sendText` returns immediately, and it takes quite a bit for
		// the terminal to actually process standard input.
		// There's no way (that I know of) to check the standard output of the
		// terminal, and I don't know how else we'd check to see if the terminal
		// was done processing the input buffer.
		// The end result is that, the longer `cmd` is, the more we have to wait
		// until we send the newline to execute -- otherwise, it just gets
		// appended to the buffer as far as IPython is concerned. If you run
		// IPython with --simple-prompt, then this isn't an issue - but you lose
		// color and tab-completion (and maybe more). So this is clunky at best;
		// users will have to tweak the delay parameters until things behave in
		// their systems. This is probably why the original code used the `%run`
		// magic command instead.
		if (cmd.length > 0) {
			terminal.show(true);  // preserve focus
			// FIXME: This returns immediately, before the terminal has updated,
			// so no amount of `minimumExecutionDelayMilliseconds` will be
			// correct if `cmd` varies in length.
			terminal.sendText(cmd, false);
			console.log(`Command sent to terminal`);
			let lines = cmd.split(newLine);
			let lastLine = lines[lines.length - 1];
			// Attempt to detect if the last line was indented.
			if(lastLine.startsWith(' ') || lastLine.startsWith('\t')) {
				terminal.sendText('', true);
				console.log(`Newline sent to terminal due to indentation`);
			}
			let n100Chars = cmd.length / 100;
			let delay = n100Chars * execDelayPer100CharsMsec + minExecDelayMsec;
			console.log(`Waiting ${delay} milliseconds to send execution newline for ${cmd.length} characters...`);
			await wait(delay);
			terminal.sendText('', true);
			console.log(`Newline sent to terminal to execute`);
			await vscode.commands.executeCommand('workbench.action.terminal.scrollToBottom');
		}
	}

	async function createTerminal(terminalName: string): Promise<vscode.Terminal> {
		console.log('Creating IPython Terminal...');

		// -- Create and Tag IPython Terminal
		await vscode.commands.executeCommand('workbench.action.createTerminalEditor');
		await vscode.commands.executeCommand('workbench.action.terminal.renameWithArg', {name : terminalName});
		console.log(`Waiting ${terminalDelayMsec} before executing IPython`);
		await wait(terminalDelayMsec);
		let terminal = vscode.window.activeTerminal as vscode.Terminal;

		// Launch options
		let cmd = 'ipython ';
		if (launchArgs !== undefined) {
			cmd += launchArgs;
		}

		// Startup options
		// REF: https://ipython.readthedocs.io/en/stable/config/intro.html#command-line-arguments
		let startupCmd = '';
		if (startupCmds.length > 0) {
			for (let c of startupCmds) {
				startupCmd += " --InteractiveShellApp.exec_lines=" + `'${c}'`;
			}
			cmd += startupCmd;
		}
		console.log('Startup Command: ', cmd);
		await execute(terminal, cmd);
		// See notes in `execute` regarding delays.
		console.log(`Waiting ${ipythonDelayMsec} milliseconds after IPython launch...`);
		await wait(ipythonDelayMsec);
		return terminal;
	}

	function makeTerminalName(terminalName: string): string {
		if (uniqueTerminals) {
			return `${terminalPrefix} - ${terminalName}`;
		}
		return terminalPrefix;
	}

	async function getTerminal(terminalName: string): Promise<vscode.Terminal> {
		let name = makeTerminalName(terminalName);
		let terminals = vscode.window.terminals;
		if (terminals.length > 0) {
			for (let i = terminals.length - 1; i >= 0; i--) {
				if (terminals[i].name === name) {
					return terminals[i];
				}
			}
		}
		return await createTerminal(name);
	}

	function getEditor(): vscode.TextEditor {
		let editor = vscode.window.activeTextEditor;
		if (editor === undefined) {
			throw new Error('Unable to access Active Text Editor');
		}
		if (editor.document.languageId !== 'python') {
			throw new Error(`Editor file is ${editor.document.languageId}; expected Python.`);
		}
		return editor;
	}

	// === COMMANDS ===
	async function cmdRunFile(resetFirst: boolean = false) {
		updateConfig();
		console.log('IPython run file...');
		let editor = getEditor();
		let terminal = await getTerminal(editor.document.fileName);
		if (resetFirst) {
			await execute(terminal, `%reset -f`);
		}
		await execute(terminal, `%run ${editor.document.fileName}`);
	}

	async function cmdResetAndRunFile() {
		console.log('IPython reset and run file...');
		cmdRunFile(true);
	}

	// -- Run a Selected Group of Text or Lines
	async function cmdRunSelections() {
		updateConfig();
		console.log('IPython run selection...');
		let editor = getEditor();
		let terminal = await getTerminal(editor.document.fileName);
		let cmd = '';
		for (let selection of editor.selections) {
			cmd += editor.document.getText(selection.with());
		}
		await execute(terminal, cmd);
	}

	//-- Run a Cell
	async function cmdRunCell(goToNextCell: boolean) {
		updateConfig();
		console.log('IPython run cell...');
		let editor = getEditor();

		let startLine = editor.selection.start.line;
		let lines = editor.document.getText().split(newLine);

		// Search up from the cursor line for a cell marker.
		let cellStart = 0;
		for (let i = startLine; i >= 0; i--) {
			if (lines[i].trim().match(cellPattern)) {
				cellStart = i + 1; // code starts on line below marker
				break;
			}
		}

		// Search down for the next cell marker
		let nextCell = lines.length;
		for (let i = startLine + 1; i < lines.length; i++) {
			if (lines[i].trim().match(cellPattern)) {
				nextCell = i;
				break;
			}
		}

		let terminal = await getTerminal(editor.document.fileName);
		let endOfFile = nextCell === lines.length;
		let cellStop = nextCell;
		let startPosition = new vscode.Position(cellStart, 0);
		let stopPosition = new vscode.Position(cellStop, 0);
		let selection = new vscode.Selection(startPosition, stopPosition);
		let cmd = editor.document.getText(selection.with());
		await execute(terminal, cmd);

		if (goToNextCell && !endOfFile) {
			moveAndRevealCursor(nextCell, editor);
		}
	}

	async function cmdRunCellAndMoveToNext() {
		console.log('IPython run selection and next...');
		cmdRunCell(true);
	}

	async function runCursor(toFrom: string) {
		updateConfig();
		let editor = getEditor();

		let startPosition: vscode.Position;
		let stopPosition: vscode.Position;
		if (toFrom === 'top') {
			startPosition = new vscode.Position(0, 0);
			stopPosition = new vscode.Position(editor.selection.start.line + 1, 0);
		}else if (toFrom === 'bottom') {
			startPosition = new vscode.Position(editor.selection.start.line, 0);
			stopPosition = new vscode.Position(editor.document.lineCount, 0);
		}else{
			console.error(`Invalid option "toFrom": ${toFrom}`);
			return;
		}

		let selection = new vscode.Selection(startPosition, stopPosition);
		let cmd = editor.document.getText(selection.with());
		let terminal = await getTerminal(editor.document.fileName);
		await execute(terminal, cmd);
	}

	async function cmdRunToLine() {
		console.log('IPython: Run from Top to Line...');
		await runCursor('top');
	}

	async function cmdRunFromLine() {
		console.log('IPython: Run from Line to Bottom...');
		await runCursor('bottom');
	}

	async function cmdCreateTerminal() {
		console.log('IPython: Creating terminal...');
		updateConfig();
		await createTerminal(terminalPrefix);
	}

	// -- Register Command to Extension
	context.subscriptions.push(vscode.commands.registerCommand('ipython.createTerminal', cmdCreateTerminal));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runFile', cmdRunFile));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.resetAndRunFile', cmdResetAndRunFile));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runSelections', cmdRunSelections));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runCell', cmdRunCell));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runCellAndMoveToNext', cmdRunCellAndMoveToNext));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runToLine', cmdRunToLine));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runFromLine', cmdRunFromLine));

	// -- FIXME: Keybinding `when clause`
	vscode.commands.executeCommand('setContext', 'ipython.extensionActive', true);
}

// this method is called when your extension is deactivated
export function deactivate() {}
