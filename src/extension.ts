// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';
import { Console } from 'console';
import { StringDecoder } from 'string_decoder';
import { MirrorFs } from './mirrorFs';
import { processQuery } from './regexUtils';
import { StreamingLines } from './StreamingLines';

export type Maybe<T> = T | null | undefined;

const rootPath = "C:\\";
const qgrepBinPath = "C:\\bin\\qgrep.exe";
const qgrepProject = "test";

export class QGrepSearchProvider implements vscode.TextSearchProvider
{
	provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextSearchComplete> {
		return new Promise((resolve, reject) => {
			// const cwd = options.folder.fsPath;
			let processedQuery = processQuery(query, options);

			let qgrepOptions = "HDCE";
			if (query.isCaseSensitive)
			{
				qgrepOptions += "i";
			}

			if (!processedQuery.isRegex)
			{
				qgrepOptions += "l"; // Literal
			}

			let args = ["search", qgrepProject, qgrepOptions, processedQuery.pattern];
			console.log("qgrep args: " + args);

			let streamingLines = new StreamingLines();

			let qgrepProc: Maybe<cp.ChildProcess> = cp.spawn(qgrepBinPath, args, { cwd: rootPath });
			qgrepProc.on('error', e => {
				console.error(e);
				reject(new Error(JSON.stringify({ message:  e && e.message, code: qgrepProc?.exitCode })));
			});

			token.onCancellationRequested(() => {
				console.log('Cancelled, killing qgrep.');
				qgrepProc?.kill();
			});

			qgrepProc.stdout!.on('data', data => {
				streamingLines.write(data);
			});

			qgrepProc.on('close', () => {
				streamingLines.end();

				resolve({
					limitHit: false
				});
			});

			streamingLines.on('line', line => {
				var indices = [];
				for (var i = 0; i < line.length; i++) {
					if (line[i] === ":") {
						indices.push(i);
					}
				}

				if (indices[0] === 1) { // C:\ for example
					indices.shift();
				}

				let fileName = line.substring(0, indices[0]);
				let lineNumber = parseInt(line.substring(indices[0] + 1, indices[1]));
				let startColumn = parseInt(line.substring(indices[1] + 1, indices[2]));
				let endColumn = parseInt(line.substring(indices[2] + 1, indices[3]));
				let previewText = line.substring(indices[3] + 1);

				let match = {
					uri: MirrorFs.toMirrorUri(fileName, options.folder.authority, rootPath),
					ranges: [new vscode.Range(lineNumber - 1, startColumn - 1, lineNumber - 1, endColumn)],
					preview: {text: previewText, matches: [new vscode.Range(0, startColumn - 1, 0, endColumn)]}
				};

				progress.report(match);
			});
		});
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

	const mirrorFs = new MirrorFs("qgrep", rootPath);
	context.subscriptions.push(
		vscode.workspace.registerFileSystemProvider('mirror', mirrorFs, { isCaseSensitive: false, isReadonly: true }));

	let textSearchProviderDisposable = vscode.workspace.registerTextSearchProvider("mirror", new QGrepSearchProvider());

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let commandDisposable = vscode.commands.registerCommand('qgrep-code.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from qgrep-code!');
		vscode.workspace.updateWorkspaceFolders(0, 0, {
			uri: vscode.Uri.parse('mirror://qgrep/'),
			 name: `QGrepFS - ${rootPath}`
		});
	});

	context.subscriptions.push(textSearchProviderDisposable);
	context.subscriptions.push(commandDisposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
