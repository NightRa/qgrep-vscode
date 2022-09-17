// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { Console } from 'console';
import { StringDecoder } from 'string_decoder';
import { MirrorFs } from './mirrorFs';
import { processQuery } from './regexUtils';
import { StreamingLines } from './StreamingLines';
import { homedir } from 'os';
import * as qgrep from 'npm-qgrep';

export type Maybe<T> = T | null | undefined;

var initialized = false;

export class QGrepSearchProvider implements vscode.TextSearchProvider
{
	constructor(private qgrepProjectPath: string, private rootPath: string) {}

	provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextSearchComplete> {
		return new Promise((resolve, reject) => {
			// const cwd = options.folder.fsPath;
			let processedQuery = processQuery(query, options);

			let qgrepOptions = "HDCE";
			if (!query.isCaseSensitive)
			{
				qgrepOptions += "i";
			}

			if (!processedQuery.isRegex)
			{
				qgrepOptions += "l"; // Literal
			}

			let args = ["search", this.qgrepProjectPath, qgrepOptions, processedQuery.pattern];
			console.log("qgrep args: " + args);

			let streamingLines = new StreamingLines();

			let qgrepProc: Maybe<cp.ChildProcess> = cp.spawn(qgrep.qgrepPath, args, { cwd: this.rootPath });
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

			var numResults = 0;
			var limitHit = false;
			qgrepProc.on('close', () => {
				streamingLines.end();

				resolve({ limitHit });
			});

			streamingLines.on('line', line => {
				if (numResults > options.maxResults)
				{
					limitHit = true;
					return;
				}

				numResults++;

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
					uri: MirrorFs.toMirrorUri(fileName, options.folder.authority, this.rootPath),
					ranges: [new vscode.Range(lineNumber - 1, startColumn - 1, lineNumber - 1, endColumn - 1)],
					preview: {text: previewText, matches: [new vscode.Range(0, startColumn - 1, 0, endColumn - 1)]}
				};

				progress.report(match);
			});
		});
	}
}

async function getRootPath(projectFile: vscode.Uri): Promise<string | undefined> {
	let projectFileContents = await vscode.workspace.fs.readFile(projectFile);
	let lines = StreamingLines.bytesToLinesArray(Buffer.from(projectFileContents));
	
	// We assume we only have one root directory, and that the path is explicit.
	let pathLine = lines.find(line => line.trim().startsWith("path"));
	if (!pathLine) {
		return undefined;
	}

	return pathLine.substring("path ".length).trim();
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	
	let extDesc = context.extension.packageJSON;
	extDesc['enabledApiProposals'] = ["textSearchProvider"];

	let commandDisposable = vscode.commands.registerCommand('qgrep-code.loadQGrepProject', () => {
		if (initialized)
		{
			vscode.window.showErrorMessage("QGrep workspace already initialized. Try loading a project in a new window.");
			return;
		}
		initialized = true;

		vscode.window.showOpenDialog({
			defaultUri: vscode.Uri.file(path.join(homedir(), ".qgrep")),
			canSelectMany: false,
			filters: {
				'QGrep Configuration': ['cfg']
			},
			title: "Choose QGrep configuration file"
		}).then(async result => {
			if (result)
			{
				let qgrepProjectPath = result[0];
				let rootPath = await getRootPath(qgrepProjectPath);
				if (!rootPath)
				{
					vscode.window.showErrorMessage(`Root path not found in QGrep project file ${qgrepProjectPath.fsPath}`);
					return;
				}

				const mirrorFs = new MirrorFs("qgrep", rootPath);
				context.subscriptions.push(
					vscode.workspace.registerFileSystemProvider('mirror',
					mirrorFs, { isCaseSensitive: false, isReadonly: true }));

				context.subscriptions.push(
					vscode.workspace.registerTextSearchProvider('mirror',
					new QGrepSearchProvider(qgrepProjectPath.fsPath, rootPath)));

				vscode.workspace.updateWorkspaceFolders(0, 0, {
					uri: vscode.Uri.parse('mirror://qgrep/'),
					name: `QGrepFS - ${rootPath}`
				});
			}
		});
	});

	context.subscriptions.push(commandDisposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
