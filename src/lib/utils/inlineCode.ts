export type TextPart = { text: string; code: boolean };

/**
 * Splits copy at backtick pairs so a flag such as `--cli gemini` renders as code that does not
 * wrap at its hyphens. An unpaired backtick stays as text.
 */
export function splitInlineCode(text: string): TextPart[] {
	const parts: TextPart[] = [];
	const pieces = text.split('`');
	const paired = pieces.length % 2 === 1 ? pieces.length : pieces.length - 1;
	for (let i = 0; i < pieces.length; i++) {
		const code = i % 2 === 1 && i < paired;
		const piece = i % 2 === 1 && !code ? `\`${pieces[i]}` : pieces[i];
		if (piece) parts.push({ text: piece, code });
	}
	return parts;
}
