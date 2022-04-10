// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
// import { exec } from 'child_process';
import * as vscode from 'vscode';
// import { Event, Terminal, TerminalOptions, window } from 'vscode';

// === EXPERIMENTAL ===
//  - Python spawn
import * as cproc from 'child_process';

// === CONSTANTS ===
// \x0A is hex code for `Enter` key which likely is better than \n
let enterKey:string = '\x0A';

let newLine:string = '\n';  // default to eol === 1
let editor = vscode.window.activeTextEditor;
if (editor !== undefined){
	let eol = editor.document.eol;
	if (eol === 2){
		newLine = '\r\n';
	}
}

let terminalName = 'IPython';  //TODO: consider making configurable?!
let execLagMilliSec = 100;
let encodePattern = new RegExp('coding[=:]\\s*([-\\w.]+)');
let python:cproc.ChildProcessWithoutNullStreams;

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
	console.log('Cell Flag: ' + cellFlag);



	// === LOCAL HELPERS ===
	async function getIpythonCommand(document: vscode.TextDocument, selection: vscode.Selection | undefined){
		// FIXME: temporary measure until a full on integration with IPython API instead
		// NOTE: found full integration with IPython API is not simple with
		//  VSCode extension. Better for MS Python team handle.
		await document.save();  // force saving to properly use IPython %load
		if (selection === undefined){
			// REF: https://ipython.readthedocs.io/en/stable/interactive/magics.html#magic-run
			 // use escape backslash seem to help. From suggestion in issue.
			return `%run ${document.fileName} \\ ${enterKey}`;
		} else if (selection !== undefined){
			let text = document.getText(selection.with());
			let cmd = undefined;
			if (selection.isSingleLine){
				cmd = `${text.trimEnd()}${enterKey}`;
			} else{
				// Check empty selection
				let textLines = text.split(enterKey);
				const isEmpty = (aString:string) => aString.length === 0;
				if (textLines.every(isEmpty)){
					return undefined;
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
					cmd = `${textLines[begin].trimEnd()}${enterKey}`;
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
					// NOTE: expect no newline from sendText(),
					// Multiple enterKey's:
					//  - 1 for load,
					// 	- 1 to finish (extra needed in a code block like if/else)
					//  - 1 to exec
					cmd = `%load -r ${startLine}-${stopLine} ${document.fileName}${enterKey}${enterKey}${enterKey}`;
				}
			}
			return cmd;
		}

	}

	async function execute(terminal:vscode.Terminal, cmd:string){
		if (cmd.length > 0){
			terminal.show(true);  // preserve focus
			terminal.sendText(cmd, false);
			await vscode.commands.executeCommand('workbench.action.terminal.scrollToBottom');
		}
		// Add a small async delay between each execution to alleviate async race condition
		//  NOTE: a temporary fix until better terminal / console API if it becomes available
		return new Promise(resolve => setTimeout(resolve, execLagMilliSec));
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
			startupCmd = " --InteractiveShellApp.exec_lines=";
			for (let c of cmds){
				startupCmd += " --InteractiveShellApp.exec_lines=" + `'${c}'`;
			}
			cmd += startupCmd;
		}
		console.log('Startup Command: ', startupCmd);
		await execute(terminal, cmd + enterKey);
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

		let cmd = await getIpythonCommand(editor.document, undefined);
		if (cmd !== undefined){
			console.log('IPython Run File Command: ' + cmd);
			let terminal = await getTerminal();
			if (terminal !== undefined){
				if (isReset){
					await execute(terminal, `%reset -f ${enterKey}`);
				}
				await execute(terminal, cmd);
			}
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
				let cmd = await getIpythonCommand(editor.document, select);
				if (cmd !== undefined){
					console.log('IPython Run Line Selection(s): ' + cmd);
					await execute(terminal, cmd);
				}
			}
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
		let cmd = await getIpythonCommand(editor.document, selection);

		if (cmd !== undefined){
			console.log('IPython Run Cell: ' + cmd);
			await execute(terminal, cmd);
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

		let cmd = await getIpythonCommand(editor.document, selection);
		if (cmd !== undefined){
			let terminal = await getTerminal();
			if (terminal !== undefined){
				await execute(terminal, cmd);
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
export function deactivate() {
	python.kill();
}
