// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
// import { Event, Terminal, TerminalOptions, window } from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	let terminalName = 'IPython';  //TODO: consider making configurable?!

	let config = vscode.workspace.getConfiguration('ipython');
	let cellFlag = config.get('cellTag') as string;
	let cellPattern = new RegExp(`^(?:${cellFlag})`);
	console.log('Cell Flag: ' + cellFlag);

	let newLine:string = '\n';  // default to eol === 1
	let editor = vscode.window.activeTextEditor;
	if (editor !== undefined){
		let eol = editor.document.eol;
		if (eol === 2){
			newLine = '\r\n';
		}
	}

	// ------------ HELPERS ----------------
	function checkEncodingTag(document: vscode.TextDocument){
		// REF: https://docs.python.org/3/reference/lexical_analysis.html#encoding-declarations
		let range = new vscode.Range(
			new vscode.Position(0, 0),  // first line
			new vscode.Position(1, 0)   // second line
		);
		let topTwoLines = document.getText(range);
		return topTwoLines.match(new RegExp('coding[=:]\s*([-\w.]+)'));
	}


	function moveAndRevealCursor(line: number, editor: vscode.TextEditor){
		let position = editor.selection.start.with(line, 0);
		let cursor = new vscode.Selection(position, position);
		editor.selection = cursor;
		editor.revealRange(cursor.with(), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
	}


	async function getIpythonCommand(document: vscode.TextDocument, selection: vscode.Selection | undefined){
		// FIXME: temporary measure until a full on integration with IPython API instead
		await document.save();  // force saving to properly use IPython %load
		if (selection === undefined){
			// REF: https://ipython.readthedocs.io/en/stable/interactive/magics.html#magic-run
			return `%run ${document.fileName} ${newLine}`;
		} else if (selection !== undefined){
			let text = document.getText(selection.with());
			let cmd:string;
			if (selection.isSingleLine){
				cmd = `${text}`;
			} else{
				// Find and only execute non-empty lines
				let textLines = text.split(newLine);
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
					cmd = `${textLines[begin]}`;
				}else{
					// REF: https://ipython.readthedocs.io/en/stable/interactive/magics.html?highlight=%25load%20magic%20command#magic-load
					let match = checkEncodingTag(document);
					if (match === null){
						// IPython %load is 1-index
						startLine += 1;
						stopLine += 1;
						// else don't need to +1 since %load ignores `# encoding` line
					}
					// NOTE: need extra newlines to execute loaded code (also expect an extra newline from sendText())
					cmd = `%load -r ${startLine}-${stopLine} ${document.fileName} ${newLine}${newLine}`;
				}
			}
			return cmd;
		}

	}

	async function execute(terminal:vscode.Terminal, cmd:string){
		terminal.show(true);  // preserve focus
		terminal.sendText(cmd);
		await vscode.commands.executeCommand('workbench.action.terminal.scrollToBottom');
	}

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

		// Launch options
		let launchArgs = config.get('launchArgs');
		if (launchArgs !== undefined){
			terminal.sendText('ipython ' + launchArgs);
		}else{
			terminal.sendText('ipython');
		}

		// Startup options
		let cmds = config.get('startupCommands') as any[];
		if (cmds !== undefined){
			for (let cmd of cmds){
				await execute(terminal, cmd);
			}
		}
		return terminal;
	}

	async function getTerminal() {
		let terminal = vscode.window.activeTerminal;
		if (terminal !== undefined){
			if (terminal.name === 'IPython') {
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

	// ------------ COMMANDS ----------------
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

		let cmd = await getIpythonCommand(editor.document, undefined);
		if (cmd !== undefined){
			console.log('IPython Run File Command: ' + cmd);
			let terminal = await getTerminal();
			if (terminal !== undefined){
				await execute(terminal, cmd);
			}
		} else{
			console.error('Unable to get IPython command');
		}
	};

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
					if (!select.isSingleLine){
						// Multi-line selection don't always include endOfLine
						// needed to execute code after %load
						terminal.sendText('');
					}
				}else{
					console.error('Failed to run selection');
					return;
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
		} else{
			console.error('Unable to execute cell command: ' + cmd);
			return;
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
		} else{
			console.error('Failed to get command');
			return;
		}
	}

	async function runToLine(){
		console.log('IPython: Run from Top to Line...');
		await runCursor('top');
	}

	async function runFromLine(){
		console.log('IPython: Run from Top to Line...');
		await runCursor('bottom');
	}

	// -- Register Command to Extension
	context.subscriptions.push(vscode.commands.registerCommand('ipython.createTerminal', createTerminal));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runFile', runFile));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runSelections', runSelections));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runCell', runCell));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runCellAndMoveToNext', runCellAndMoveToNext));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runToLine', runToLine));
	context.subscriptions.push(vscode.commands.registerCommand('ipython.runFromLine', runFromLine));

	// -- Keybinding `when clause`
	vscode.commands.executeCommand('setContext', 'ipython.isUse', true);
}

// this method is called when your extension is deactivated
export function deactivate() {}
