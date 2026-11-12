/// <reference lib="webworker" />

import { createGrammarParser, type GrammarParse } from './grammarParser';

declare const self: DedicatedWorkerGlobalScope;

interface InitMessage {
	type: 'init';
}

interface ParseMessage {
	type: 'parse';
	filePath: string;
	content: string;
	language: string;
}

type WorkerMessage = InitMessage | ParseMessage;

let parse: GrammarParse | null = null;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
	const msg = e.data;

	if (msg.type === 'init') {
		try {
			parse = await createGrammarParser((file) => `/${file}`);
			self.postMessage({ type: 'init-done' });
		} catch (err) {
			self.postMessage({ type: 'error', error: `Init failed: ${err}` });
		}
		return;
	}

	if (msg.type === 'parse') {
		if (!parse) {
			self.postMessage({ type: 'error', filePath: msg.filePath, error: 'Parser not initialized' });
			return;
		}
		try {
			const { symbols, refs } = await parse(msg.filePath, msg.content, msg.language);
			self.postMessage({ type: 'parse-result', filePath: msg.filePath, symbols, refs });
		} catch (err) {
			self.postMessage({ type: 'error', filePath: msg.filePath, error: `Parse failed: ${err}` });
		}
	}
};
