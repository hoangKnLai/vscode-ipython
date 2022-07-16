// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { watch } from 'fs';
import * as vscode from 'vscode';

// === CONSTANTS ===
let newLine:string = '\n';  // default to eol === 1
let editor = vscode.window.activeTextEditor;
if (editor !== undefined){
	let eol = editor.document.eol;
	if (eol === 2){
		newLine = '\r\n';
	}
}
// \x0A is hex code for `Enter` key which likely is better than \n
let enterKey:string = '\x0A';
// let enterKey:string = newLine;

let terminalName = 'IPython';  //TODO: consider making configurable?!
// let execLagMilliSec = 32;
let encodePattern = new RegExp('coding[=:]\\s*([-\\w.]+)');

// === FUNCTIONS ===
async function activatePython(){
	let pyExtension = vscode.extensions.getExtension('ms-python.python');
	if (pyExtension === undefined){
		console.error('Failed to get MS-Python Extension');
		return;
	}
	await pyExtension.activate();
}


function checkEncodingTag(document: vscode.TextDocument){
	// REF: https://docs.python.org/3/reference/lexical_analysis.html#encoding-declarations
	let match = false;
	for (let i = 0; i < 2; i++){
		let textLine = document.lineAt(i);
		match = encodePattern.test(textLine.text);
		if (match){
			return match;
		}
	}
	return match;
}


function moveAndRevealCursor(line: number, editor: vscode.TextEditor){
	let position = editor.selection.start.with(line, 0);
	let cursor = new vscode.Selection(position, position);
	editor.selection = cursor;
	editor.revealRange(cursor.with(), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}


function wait(msec:number) {
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
	let config = vscode.workspace.getConfiguration('ipython');
	let cellFlag = config.get('cellTag') as string;
	let cellPattern = new RegExp(`^(?:${cellFlag})`);
	let execLagMilliSec = config.get('execLagMilliSec') as number;
	console.log('Cell Flag: ' + cellFlag);

	// === LOCAL HELPERS ===
	function getIpythonCommand(
		document: vscode.TextDocument,
		selection: vscode.Selection | undefined){

		let nExec = 0;  // Number of execution needed on IPython console
		let cmd = '';
		document.save();  // force saving to properly use IPython %load
		if (selection === undefined){
			// -- Whole File
			// REF: https://ipython.readthedocs.io/en/stable/interactive/magics.html#magic-run
			cmd = `%run "${document.fileName}"`;
			nExec = 1;
			return {cmd, nExec};
		}else{
			// -- Single line
			if (selection.isSingleLine){
				let text:string = '';
				if (selection.isEmpty){  // support: run line at cursor when empty selection
					text = document.lineAt(selection.start.line).text;
				} else {
					text = document.getText(selection.with());
				}
				cmd = `${text.trim()}`;
				nExec = 1;
				return {cmd, nExec};
			}

			// -- Check and ignore empty multi-line selection
			let textLines = document.getText(selection.with()).split(newLine);
			const isEmpty = (elem:string) => elem.length === 0;
			if (textLines.every(isEmpty)){
				cmd = '';
				nExec = 0;
				return {cmd, nExec};
			}

			// -- Stack multiple consecutive lines
			let start = selection.start.with(selection.start.line, 0);
			let range = selection.with(start);
			textLines = document.getText(range).split(newLine);
			const isNotEmpty = (elem:string) => elem.length > 0;
			textLines = textLines.filter(isNotEmpty);
			cmd = textLines.join(newLine);
			nExec = 1;
			return {cmd, nExec};
		}
	}

	async function execute(
		terminal:vscode.Terminal,
		cmd:string,
		nExec:number=1){
		if (cmd.length > 0){
			terminal.show(true);  // preserve focus

			// No newLine to execute since IPython is trippy with when/how to
			// execute a code line, block, multi-lines/blocks, etc.
			terminal.sendText(cmd, false);  // false: no append `newline`
			console.log(`Command sent to terminal`);

			// Wait for IPython to register command before execution
			// in case it got stuck between each enterKey sent
			if (nExec > 0){
				console.log(`+ Number of Execution: ${nExec}`);
				for (let i = 0; i < nExec; i++) {
					await wait(execLagMilliSec);
					console.log(`- Waited ${execLagMilliSec} msec`);
					terminal.sendText(`${enterKey}`);
					console.log(`- Execute ID ${i}`);
				}
			}
		}
	}

	async function createTerminal(){
		console.log('Creating IPython Terminal...');

		// -- Create and Tag IPython Terminal
		await vscode.commands.executeCommand('python.createTerminal');
		await vscode.commands.executeCommand('workbench.action.terminal.renameWithArg', {name : terminalName});
		let terminal = vscode.window.activeTerminal as vscode.Terminal;

		// Launch options
		let cmd = 'ipython ';
		let launchArgs = config.get('launchArgs');
		if (launchArgs !== undefined){
			cmd += launchArgs;
		}

		// Startup options
		// REF: https://ipython.readthedocs.io/en/stable/config/intro.html#command-line-arguments
		let cmds = config.get('startupCommands') as any[];
		let startupCmd = '';
		if (cmds !== undefined){
			startupCmd = ' --InteractiveShellApp.exec_lines=';
			for (let c of cmds){
				startupCmd += ' --InteractiveShellApp.exec_lines=' + `'${c}'`;
			}
			cmd += startupCmd;
		}
		console.log('Startup Command: ', startupCmd);
		await execute(terminal, cmd);
		await wait(256);  // IPython takes awhile to load
		await vscode.commands.executeCommand('workbench.action.terminal.scrollToBottom');
		return terminal;
	}

	async function getTerminal() {
		let terminal = vscode.window.activeTerminal;
		// FIXME: use RegExp for terminalName
		if (terminal !== undefined){
			if (terminal.name === terminalName) {
				return terminal;
			}
		}

		let terminals = vscode.window.terminals;
		if (terminals.length > 1) {
			for (let i = terminals.length - 1; i >= 0; i--) {
				if (terminals[i].name === terminalName){
					return terminals[i];
				}
			}
		} else {
			let terminal = await createTerminal();
			if (terminal !== undefined){
				return terminal;
			}
		}
	}

	// === COMMANDS ===
	async function runFile(isReset:Boolean=false){
		console.log('IPython run file...');
		let editor = vscode.window.activeTextEditor;
		if (editor === undefined){
			console.error('Unable to access Active Text Editor');
			return;
		}
		if (editor.document.languageId !== 'python'){
			console.error('Command only support "python" .py file');
			return;
		}

		let {cmd, nExec} = getIpythonCommand(editor.document, undefined);
		if (cmd !== ''){
			let terminal = await getTerminal();
			if (terminal !== undefined){
				if (isReset){
					console.log('Reset workspace');
					await execute(terminal, `%reset -f`, 1);
				}
				console.log('IPython Run File Command: ' + cmd);
				await execute(terminal, cmd, nExec);
			}
			await vscode.commands.executeCommand('workbench.action.terminal.scrollToBottom');
		}
	}

	async function resetAndRunFile(){
		console.log('IPython reset and run file...');
		runFile(true);
	}

	// -- Run a Selected Group of Text or Lines
	async function runSelections(){
		console.log('IPython run selection...');
		let editor = vscode.window.activeTextEditor;
		if (editor === undefined){
			console.error('Unable to access Active Text Editor');
			return;
		}
		if (editor.document.languageId !== 'python'){
			console.error('Command only support "python" .py file');
			return;
		}

		let terminal = await getTerminal();
		if (terminal !== undefined){
			for (let select of editor.selections){
				let {cmd, nExec} = getIpythonCommand(editor.document, select);
				if (cmd !== ''){
					console.log(`IPython Run Line Selection(s):${cmd}`);
					await execute(terminal, cmd, nExec);
				}
			}
			await vscode.commands.executeCommand('workbench.action.terminal.scrollToBottom');
		} else{
			console.error('Unable to get an IPython Terminal');
			return;
		}
	}

	//-- Run a Cell
	async function runCell(isNext: boolean){
		console.log('IPython run cell...');
		let editor = vscode.window.activeTextEditor;
		if (editor === undefined){
			console.error('Unable to access Active Text Editor');
			return;
		}
		if (editor.document.languageId !== 'python'){
			console.error('Command only support "python" .py file');
			return;
		}

		let startLine = editor.selection.start.line;
		let file = editor.document.getText();
		let lines = file.split(newLine);

		// Cell start/stop lines
		let cellStart = 0;
		for (let i = startLine; i > 0; i--){
			if (lines[i].trim().match(cellPattern)){
				cellStart = i;
				break;
			}
		}
		let nextCell = lines.length;
		for (let i = startLine + 1; i < lines.length; i++){
			if (lines[i].trim().match(cellPattern)){
				nextCell = i;
				break;
			}
		}

		let nLine = nextCell - cellStart;

		// FIXME: handle a file without any cells or just one cell
		if (nLine === 1 || nLine === lines.length){
			console.log('Found and skip empty cell or no cell file');
			moveAndRevealCursor(nextCell, editor);
			return;
		}

		// Terminal
		let terminal = await getTerminal();
		if (terminal === undefined){
			console.error('Unable to get an IPython Terminal');
			return;
		}

		let endOfFile = nextCell === lines.length;
		let cellStop = nextCell;
		if (!endOfFile){
			cellStop -= 1;
		}
		let startPosition = new vscode.Position(cellStart, 0);
		let stopPosition = new vscode.Position(cellStop, 0);
		let selection = new vscode.Selection(startPosition, stopPosition);
		let {cmd, nExec} = getIpythonCommand(editor.document, selection);

		if (cmd !== ''){
			console.log('IPython Run Cell: ' + cmd);
			await execute(terminal, cmd, nExec);
			await vscode.commands.executeCommand('workbench.action.terminal.scrollToBottom');
		}

		if (isNext && !endOfFile){
			moveAndRevealCursor(nextCell, editor);
		}
	}

	async function runCellAndMoveToNext(){
		console.log('IPython run selection and next...');
		runCell(true);
	}

	async function runCursor(toFrom: string){
		let editor = vscode.window.activeTextEditor;
		if (editor === undefined){
			console.error('Failed to get activeTextEditor');
			return;
		}
		let startPosition: vscode.Position;
		let stopPosition: vscode.Position;
		if (toFrom === 'top'){
			startPosition = new vscode.Position(0, 0);
			stopPosition = editor.selection.start;
		}else if (toFrom === 'bottom'){
			startPosition = editor.selection.start;
			stopPosition = new vscode.Position(editor.document.lineCount, 0);
		}else{
			console.error(`Invalid option "toFrom": ${toFrom}`);
			return;
		}

		let selection = new vscode.Selection(startPosition, stopPosition);

		let {cmd, nExec} = getIpythonCommand(editor.document, selection);
		if (cmd !== ''){
			let terminal = await getTerminal();
			if (terminal !== undefined){
				await execute(terminal, cmd, nExec);
				await vscode.commands.executeCommand('workbench.action.terminal.scrollToBottom');
			}else {
				console.error('Failed to get terminal');
				return;
			}
		}
	}

	async function runToLine(){
		console.log('IPython: Run from Top to Line...');
		await runCursor('top');
	}

	async function runFromLine(){
		console.log('IPython: Run from Line to Bottom...');
		await runCursor('bottom');
	}

	// -- Register Command to Extension
	context.subscriptions.push(vscode.commands.registerCommand('ipython.createTerminal', createTerminal));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runFile', runFile));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.resetAndRunFile', resetAndRunFile));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runSelections', runSelections));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runCell', runCell));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runCellAndMoveToNext', runCellAndMoveToNext));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runToLine', runToLine));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runFromLine', runFromLine));

	// -- FIXME: Keybinding `when clause`
	vscode.commands.executeCommand('setContext', 'ipython.isUse', true);
}

// this method is called when your extension is deactivated
export function deactivate() {}
