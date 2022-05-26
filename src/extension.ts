// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
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

let terminalPrefix = 'IPython';  // for the name of the terminal window.
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
	let cellPattern: RegExp;
	let execLagMilliSec: number;
	let launchArgs: string;
	let startupCmds: string[];
	function updateConfig() {
		console.log('Updating configuration...');
		let config = vscode.workspace.getConfiguration('ipython');
		let cellFlag = config.get('cellTag') as string;
		cellPattern = new RegExp(`^(?:${cellFlag})`);
		execLagMilliSec = config.get('execLagMilliSec') as number;
		console.log('Cell Flag: ' + cellFlag);
		launchArgs = config.get('launchArgs') as string;
		startupCmds = config.get('startupCommands') as string[];
	}

	// === LOCAL HELPERS ===
	function getIpythonCommand(
		document: vscode.TextDocument,
		selection: vscode.Selection | undefined){
		// FIXME: temporary measure until a full on integration with IPython API instead
		// NOTE: found full integration with IPython API is not simple with
		//  VSCode extension. Better for MS Python team handle.
		let nExec = 0;  // Number of execution needed on IPython console
		let cmd = '';
		document.save();  // force saving to properly use IPython %load
		if (selection === undefined){
			// REF: https://ipython.readthedocs.io/en/stable/interactive/magics.html#magic-run
			cmd = `%run ${document.fileName}`;
			nExec = 1;
			return {cmd, nExec};
		}else{
			let text = document.getText(selection.with());
			if (selection.isSingleLine){
				cmd = `${text.trimEnd()}`;
				nExec = 1;
				return {cmd, nExec};
			}
			// Check empty selection
			let textLines = text.split(newLine);
			const isEmpty = (aString:string) => aString.length === 0;
			if (textLines.every(isEmpty)){
				cmd = '';
				nExec = 0;
				return {cmd, nExec};
			}

			// Trim empty lines around a code block
			let begin = 0;
			for (let i = 0; i < textLines.length; i++){
				if (textLines[i].trim().length > 0){
					break;
				} else{
					begin += 1;
				}
			}

			let startLine = selection.start.line + begin;

			let end = 0;
			for (let i = textLines.length - 1; i >= 0; i--){
				if (textLines[i].trim().length > 0){
					break;
				} else{
					end += 1;
				}
			}
			let stopLine = selection.end.line - end;

			let isSingleLine = startLine === stopLine;
			if(isSingleLine){
				cmd = `${textLines[begin].trimEnd()}`;
				nExec = 1;
			}else{
				// REF: https://ipython.readthedocs.io/en/stable/interactive/magics.html?highlight=%25load%20magic%20command#magic-load
				let match = checkEncodingTag(document);
				if (!match){
					// IPython %load is 1-index
					startLine += 1;
					stopLine += 1;
					// else don't need to +1 since %load ignores `# encoding` line
				}
				if (startLine === 0){
					startLine += 1;
				}
				// Multiple enterKey's:
				//  - 1 for %load,
				// 	- 1 to finish potential end of a trailing code block
				//  - 1 to exec
				nExec = 3;
				cmd = `%load -r ${startLine}-${stopLine} ${document.fileName}`;

			}
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
			terminal.sendText(cmd, false);
			console.log(`Command sent to terminal`);

			// Wait for IPython to register command before execution
			// in case it got stuck between each enterKey sent
			console.log(`+ Number of Execution: ${nExec}`);
			for (let i = 0; i < nExec; i++) {
				await wait(execLagMilliSec);
				console.log(`- Waited ${execLagMilliSec} msec`);
				terminal.sendText(`${newLine}`);
				console.log(`- Execute ID ${i}`);
			}
		}
	}

	async function createTerminal(terminalName: string = terminalPrefix): Promise<vscode.Terminal> {
		console.log('Creating IPython Terminal...');

		// -- Create and Tag IPython Terminal
		await vscode.commands.executeCommand('python.createTerminal');
		await vscode.commands.executeCommand('workbench.action.terminal.renameWithArg', {name : terminalName});
		let terminal = vscode.window.activeTerminal as vscode.Terminal;

		// Launch options
		let cmd = 'ipython ';
		if (launchArgs !== undefined){
			cmd += launchArgs;
		}

		// Startup options
		// REF: https://ipython.readthedocs.io/en/stable/config/intro.html#command-line-arguments
		let startupCmd = '';
		if (startupCmds !== undefined){
			startupCmd = " --InteractiveShellApp.exec_lines=";
			for (let c of startupCmds){
				startupCmd += " --InteractiveShellApp.exec_lines=" + `'${c}'`;
			}
			cmd += startupCmd;
		}
		console.log('Startup Command: ', startupCmd);
		await execute(terminal, cmd + newLine);
		await vscode.commands.executeCommand('workbench.action.terminal.scrollToBottom');
		return terminal;
	}

	function makeTerminalName(terminalName: string): string {
		return `${terminalPrefix} - ${terminalName}`;
	}

	async function getTerminal(terminalName: string) {
		let name = makeTerminalName(terminalName);
		let terminals = vscode.window.terminals;
		if (terminals.length > 1) {
			for (let i = terminals.length - 1; i >= 0; i--) {
				if (terminals[i].name === name){
					return terminals[i];
				}
			}
		} else {
			let terminal = await createTerminal(name);
			if (terminal !== undefined){
				return terminal;
			}
		}
	}

	// === COMMANDS ===
	async function runFile(isReset:Boolean=false){
		updateConfig();
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

			let terminal = await getTerminal(editor.document.fileName);
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
		updateConfig();
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

		let terminal = await getTerminal(editor.document.fileName);
		if (terminal !== undefined){
			for (let select of editor.selections){
				let {cmd, nExec} = getIpythonCommand(editor.document, select);
				if (cmd !== ''){
					console.log('IPython Run Line Selection(s): ' + cmd);
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
		updateConfig();
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


		// Terminal
		let terminal = await getTerminal(editor.document.fileName);
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
		updateConfig();
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
			let terminal = await getTerminal(editor.document.fileName);
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
