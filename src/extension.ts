// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import fs from "fs"
import * as path from "path";


class GitInfo {
	public owner: string;
	public repo: string;
	public branch: string;
	public token: string;
	public subFolder: string;
	public constructor(owner: string, repo: string, branch: string, token: string, subFolder: string) {
		this.owner = owner;
		this.repo = repo;
		this.branch = branch;
		this.token = token;
		this.subFolder = subFolder;
	}
}

async function uploadFileToGitHub(gitInfo: GitInfo, localFilePath: string, 
	remotePath: string): Promise<string> {
	const octokitcore = await import("@octokit/core")
	const octokit = new octokitcore.Octokit({auth: gitInfo.token,});

	// 读取本地文件内容
	let base64Content = "";
	try {
		const imageContent = fs.readFileSync(localFilePath);
		base64Content = Buffer.from(imageContent).toString("base64");
	} catch (error) {
		console.error(`无法读取本地文件 ${localFilePath}：`, error);
		vscode.window.showErrorMessage(`无法读取本地文件: ${localFilePath}`);
		return "";
	}

	// 获取sha, 如果有
	let sha = "";
	{
		const getUrl = `GET /repos/${gitInfo.owner}/${gitInfo.repo}/contents/${remotePath}`
		try {
			// 获取仓库对应同名文件的sha
			const response = await octokit.request(getUrl, {
				message: "GetGet file via GitHub API",
				branch: gitInfo.branch,
			});
			sha = response.data.sha;
		} catch (error) {
			
		}
	}
  

	const url = `PUT /repos/${gitInfo.owner}/${gitInfo.repo}/contents/${remotePath}`
	try {
		// 上传文件到 GitHub 仓库
		const response = await octokit.request(url, {
			content: base64Content,
			message: "Upload file via GitHub API",
			branch: gitInfo.branch,
			sha: sha
		});
		const githubUrl = response.data.content.html_url;
		const rawUrl = `${githubUrl}?raw=true`;
		console.log(`文件已成功上传到 Git仓库 url: ${githubUrl}`);
		return rawUrl;
	} catch (error) {
		console.error("上传文件时出错:", error);
		return "";
	}
}

// dir:string 当前目录
async function replaceImageLinks(gitInfo: GitInfo, markdown: string, dir: string): Promise<string> {
	const imageLinkRegex = /!\[([^\]]*)\]\(([^)]*)\)/g;
	let urls = new Array<string>();
	markdown.replace(imageLinkRegex, (match, altText, url) => {
		urls.push(url);
		return `![${altText}](url)`;
	})

	let remotePathPrefix = "";
	if (gitInfo.subFolder != "") {
		let sub_folder = gitInfo.subFolder.trim();
		if (sub_folder.startsWith("/"))
			sub_folder = sub_folder.substring(1);
		if (sub_folder.endsWith("/"))
			sub_folder = sub_folder.substring(0, sub_folder.length);

		remotePathPrefix = `${sub_folder}/`;
	}

	for (const url of urls) {
		if (url.startsWith("http")) {

		} else if (url.startsWith(".")) {
			const absPath = path.resolve(dir, url);
			console.log(`本地文件的绝对路径: ${absPath}`);
			const fileName = url.substring(url.lastIndexOf('/') + 1, url.length);

			const remoteUrl = await uploadFileToGitHub(gitInfo, absPath, `${remotePathPrefix}${fileName}`);
			if (remoteUrl != "") {
				markdown = markdown.replace(url, remoteUrl);
			}
		} else {
			const fileName = url.substring(url.lastIndexOf('/') + 1, url.length);
			const remoteUrl = await uploadFileToGitHub(gitInfo, url, `${remotePathPrefix}${fileName}`);
			markdown = markdown.replace(url, remoteUrl);
		}
	}
	return markdown;
};

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Markdown photo upload is now active!');

	const disposable = vscode.commands.registerCommand('markdown_photo_upload.helloworld', () => {
		// 获取整个配置对象
		const config = vscode.workspace.getConfiguration('markdown_photo_upload');
		const settingName = config.get<string>('github_token');


		vscode.window.showInformationMessage('Hello World from photo_upload!');
	});
	
	let disposable_upload = vscode.commands.registerCommand('markdown_photo_upload.upload', async () => {
		const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('没有打开的编辑器！');
            return;
        }

		// 获取配置项
		const config = vscode.workspace.getConfiguration('markdown_photo_upload');
		const token = config.get<string>('github_token');
		const owner = config.get<string>('repository_owner');
		const repo = config.get<string>('repository_name');
		const branch = config.get<string>('git_brancn');
		const subFolder = config.get<string>('sub_folder') || "";
		if (!token || !owner || !repo || !branch) {
			vscode.window.showErrorMessage('请先配置github token、repository owner、repository name和git branch！');
			return;
		}
		const gitInfo = new GitInfo(owner, repo, branch, token, subFolder);

		const fileUri = editor.document.uri;
		const filePath = fileUri.path;
		const directory = fileUri.path.substring(1, filePath.lastIndexOf('/'));

        const document = editor.document;
        const fullText = document.getText();

		await vscode.window.withProgress( 
			{
				location: vscode.ProgressLocation.Notification, // 在通知区域显示
				title: "上传图片中...",
				cancellable: false
			},
			async (progress) => {
				// 使用replace方法替换匹配到的图片链接
				const newText = await replaceImageLinks(gitInfo, fullText, directory);

				// 替换编辑器中的文本
				editor.edit(editBuilder => {
					editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), newText);
				});
				vscode.window.showInformationMessage('所有图片已上传完成！');
				return true;
			}
		);
	});
	context.subscriptions.push(disposable_upload);
}

export function deactivate() {}
