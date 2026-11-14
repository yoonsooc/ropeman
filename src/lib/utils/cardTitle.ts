// A zoomed-out card title takes at most two lines of this width: the card's 256px less its
// padding, the color dot and the gap after it
const TITLE_WIDTH = 208;
const TITLE_LINES = 2;
// Average glyph width of the display font over file and folder names, in em (measured on the canvas)
const GLYPH_EM = 0.64;
const MIN_TITLE_PX = 12;
export const MAX_TITLE_PX = 36;
// Longer titles keep their start and end around an ellipsis; the end tells sibling files apart
export const MAX_FAR_TITLE_CHARS = 28;

/** A title split where it may wrap: after a space, `_`, `-` and `/`, and before `.` and `…`. */
export function titleBreaks(title: string): string[] {
	return title.split(/(?<=[ _\-/])|(?=[.…])/);
}

/** `title`, or its start and end around an ellipsis when it is longer than `max` characters. */
export function middleEllipsis(title: string, max: number = MAX_FAR_TITLE_CHARS): string {
	if (title.length <= max) return title;
	const tail = Math.ceil((max - 1) * 0.55);
	return `${title.slice(0, max - 1 - tail)}…${title.slice(title.length - tail)}`;
}

/** Lines `title` takes at `px`, filling each line with whole pieces between break points. */
function linesAt(title: string, px: number): number {
	let lines = 1;
	let used = 0;
	for (const piece of titleBreaks(title)) {
		const width = piece.length * GLYPH_EM * px;
		if (width > TITLE_WIDTH) return Infinity;
		if (used + width > TITLE_WIDTH) {
			lines++;
			used = 0;
		}
		used += width;
	}
	return lines;
}

/** The largest font size, in card pixels, at which `title` fits the zoomed-out title lines. */
export function titleFitPx(title: string): number {
	for (let px = MAX_TITLE_PX; px > MIN_TITLE_PX; px--) {
		if (linesAt(title, px) <= TITLE_LINES) return px;
	}
	return MIN_TITLE_PX;
}
