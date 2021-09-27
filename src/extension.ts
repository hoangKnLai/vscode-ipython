// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
// import { Event, Terminal, TerminalOptions, window } from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	let terminalName = 'IPython';
	let cellPattern:RegExp = /^(?:# %%)/;
	let endOfLine:string = '\n';

	async function createTerminal(){
		console.log('Creating IPython Terminal...');
		let pyExtension = vscode.extensions.getExtension('ms-python.python');
		if (pyExtension === undefined){
			console.error('Failed to get MS-Python Extension');
			return;
		}

		await pyExtension.activate();

		// -- Create and Tag IPython Terminal
		await vscode.commands.executeCommand('python.createTerminal');
		await vscode.commands.executeCommand('workbench.action.terminal.renameWithArg', {name : terminalName});
		let terminal = vscode.window.activeTerminal as vscode.Terminal;

		// -- Use Config
		let config = vscode.workspace.getConfiguration('ipython');

		// Launch options
		let launchArgs = config.get('launchArgs');
		if (launchArgs !== undefined){
			terminal.sendText('ipython ' + launchArgs);
		}else{
			terminal.sendText('ipython');
		}

		// Startup options
		let cmds = config.get('startupCommands') as any[];
		for (let cmd of cmds){
			terminal.sendText(cmd);
		}
		return terminal;
	}

	async function getTerminal() {
		let terminal = vscode.window.activeTerminal;
		if (terminal === undefined){
			return terminal;
		}else if (terminal.name === 'IPython') {
			return terminal;
		}

		let terminals = vscode.window.terminals;
		if (terminals.length > 1) {
			let terminal = undefined;
			for (let i = terminals.length - 1; i > 0; i--) {
				terminal = terminals[i];
				if (terminal.name === 'IPython'){
					return terminal;
				}
			}
		} else {
			let terminal = await createTerminal();
			if (terminal === undefined){
				console.error('Failed to get an IPython Terminal');
			}else{
				return terminal;
			}
		}
	}

	// -- Run File using %run <path/to/file.py>
	// REF: https://ipython.readthedocs.io/en/stable/interactive/magics.html#magic-run
	async function runFile(){
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

		let fileName = editor.document.fileName;

		let cmd = '%run ' + fileName;
		console.log('IPython Run File Command: ' + cmd);
		let terminal = await getTerminal();
		if (terminal !== undefined){
			terminal.sendText(cmd);
			terminal.show();
		}
	};

	// -- Run a Selected Group of Text
	async function runSelections(){
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

		let terminal = await getTerminal();
		if (terminal === undefined){
			console.error('Unable to get an IPython Terminal');
			return;
		}

		for (let select of editor.selections){
			let range = select.with();  // current select range
			let text = editor.document.getText(range);
			console.log('IPython Run Selection: ' + text);
			terminal.sendText(text);
		}
	}

	//-- Run a Cell using %load
	// REF: https://ipython.readthedocs.io/en/stable/interactive/magics.html#magic-load
	async function runCell(){
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
		let fileName = editor.document.fileName;

		// let eol = editor.document.eol.toString();  // NOTE: not sure why it is '2'
		let lines = file.split(endOfLine);

		// Cell start/stop lines
		let cellStart = 0;
		for (let i = startLine; i > 0; i--){
			if (lines[i].trim().match(cellPattern)){
				cellStart = i;
				break;
			}
		}
		let cellStop = lines.length;
		for (let i = startLine; i < lines.length; i++){
			if (lines[i].trim().match(cellPattern)){
				cellStop = i;  // include last for slicing
				break;
			}
		}

		let nLine = cellStop - cellStart;
		if (nLine === 0 || nLine === lines.length){
			console.log('Found and skip empty cell or no cell file');
			return;
		}

		// Terminal
		let terminal = await getTerminal();
		if (terminal === undefined){
			console.error('Unable to get an IPython Terminal');
			return;
		}
		cellStart++;  // line number if 1-indexed, stop line is inclusive for IPython %load
		let cmd = `%load -r ${cellStart.toString()}-${cellStop.toString()} ${fileName}`;
		console.log('IPython Run Cell: ' + cmd);
		terminal.sendText(cmd);
		terminal.sendText('');   // newline to execute loaded lines
	}
	// -- Register Command to Extension
	context.subscriptions.push(vscode.commands.registerCommand('ipython.createTerminal', createTerminal));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runFile', runFile));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runSelections', runSelections));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runCell', runCell));
}

// this method is called when your extension is deactivated
export function deactivate() {}
