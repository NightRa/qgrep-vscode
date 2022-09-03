// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { MirrorFs } from './mirrorFs';

export class QGrepSearchProvider implements vscode.TextSearchProvider
{
	provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextSearchComplete> {
		throw new Error('Method not implemented.');
	}
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "qgrep-code" is now active!');

	let extDesc = context.extension.packageJSON;
	extDesc['enabledApiProposals'] = ["textSearchProvider"];

	const mirrorFs = new MirrorFs();
	context.subscriptions.push(
		vscode.workspace.registerFileSystemProvider('mirror', mirrorFs, { isCaseSensitive: false, isReadonly: true }));

	let textSearchProviderDisposable = vscode.workspace.registerTextSearchProvider("qgrep", new QGrepSearchProvider());

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let commandDisposable = vscode.commands.registerCommand('qgrep-code.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from qgrep-code!');
		vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('mirror://sample/'), name: 'MirrorFS - C:\\' });
	});

	context.subscriptions.push(textSearchProviderDisposable);
	context.subscriptions.push(commandDisposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
