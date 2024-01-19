#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const Terser = require('terser');

const EXT_JS = '.js';
const EXT_JSON = '.json';
const EXT_MD = '.md';
const EXT_TS = '.ts';
const ESLINT_FILES = ['.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml', '.eslintrc.cjs', '.eslintrc.config.js', '.eslintrc.config.cjs', '.eslintrc.base.js', '.eslintrc.base.cjs', '.eslintrc.jsonc', '.eslintrc.ymlc', '.eslintrc.yamlc', '.eslintrc.toml', '.eslintrc.cjson', '.eslintrc.json5', '.eslintrc5', '.eslintignore', '.eslintcache', '.eslintresult'];

const stats = {
	jsFilesCompressed: 0,
	jsonFilesCompressed: 0,
	deletedFiles: 0,
	spaceSaved: 0,
	spaceFreed: 0,
};

async function deleteAndCompress(dir) {
	try {
		// Delete the node_modules folder
		await fs.rm(dir, { recursive: true });
		console.log(`Deleted folder ${dir}`);

		// Run npm install
		await executeCommand('npm install --omit=dev');
		console.log('npm dependencies installed in production mode');

		// Continue optimization
		await processDirectory(dir, stats);
	} catch (err) {
		console.error(err);
	}
}

async function executeCommand(command) {
	return new Promise((resolve, reject) => {
		exec(command, (error, stdout, stderr) => {
			if (error) {
				console.error(`Command execution error: ${error}`);
				reject(error);
				return;
			}
			resolve(stdout ? stdout : stderr);
		});
	});
}

async function processDirectory(dir) {
	const files = await fs.readdir(dir, { withFileTypes: true });
	for (const file of files) {
		const fullPath = path.join(dir, file.name);
		if (file.isDirectory()) {
			await processDirectory(fullPath, stats);
		} else {
			await processFile(file, fullPath, stats);
		}
	}
}

async function processFile(file, fullPath) {
	const ext = path.extname(file.name);
	if (ext === EXT_MD || ext === EXT_TS || ESLINT_FILES.includes(file.name.toLowerCase())) {
		const size = (await fs.stat(fullPath)).size;
		await fs.unlink(fullPath).catch(err => console.error(`Error deleting ${fullPath}: ${err}`));
		console.log(`Deleted ${fullPath} (${(size / 1024).toFixed(2)} KB)`);
		stats.deletedFiles++;
		stats.spaceFreed += size;
	} else {
		await compressFile(fullPath, stats);
	}
}

async function compressFile(filePath) {
	const ext = path.extname(filePath);
	console.log('Compressing ' + filePath);

	try {
		if (ext === EXT_JS) {
			await compressJavaScriptFile(filePath, stats);
		} else if (ext === EXT_JSON) {
			await compressJsonFile(filePath, stats);
		}
	} catch (err) {
		console.error(`Error compressing ${filePath}: ${err}`);
	}
}

const minifyOptions = {
	ecma: 2023,
	module: true,
	mangle: true,
	compress: {
		module: true,
		toplevel: true,
		reduce_vars: false,
		hoist_vars: false,
	},
	toplevel: true,
};

async function compressJavaScriptFile(filePath) {
	const originalCode = await fs.readFile(filePath, 'utf8');
	try {
		if (!(/import\s|export\s/).test(originalCode)) {
			const result = await Terser.minify(originalCode, minifyOptions);
			if (result.code && result.code.length < originalCode.length) {
				await fs.writeFile(filePath, result.code);
				stats.jsFilesCompressed++;
				stats.spaceSaved += originalCode.length - result.code.length;
			}
		}
	} catch (err) {
		console.error(`Error compressing JavaScript in ${filePath}: ${err}`);
	}
}

async function compressJsonFile(filePath) {
	const originalContent = await fs.readFile(filePath, 'utf8');
	try {
		const json = JSON.parse(originalContent);
		const compressedContent = JSON.stringify(json);
		if (compressedContent.length < originalContent.length) {
			await fs.writeFile(filePath, compressedContent);
			stats.jsonFilesCompressed++;
			stats.spaceSaved += originalContent.length - compressedContent.length;
		}
	} catch (e) {
		console.error(`Error parsing/compressing JSON in ${filePath}: ${e}`);
	}
}

deleteAndCompress('node_modules').then(() => console.log(`Summary: 
        - Compressed JS files: ${stats.jsFilesCompressed}
        - Compressed JSON files: ${stats.jsonFilesCompressed}
        - Deleted files: ${stats.deletedFiles}
        - Space saved: ${(stats.spaceSaved / 1024).toFixed(2)} KB
        - Total memory freed: ${(stats.spaceFreed / 1024).toFixed(2)} KB`));
