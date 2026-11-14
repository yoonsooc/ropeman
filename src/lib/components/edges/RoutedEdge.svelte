<script lang="ts">
	import { BaseEdge, type EdgeProps } from '@xyflow/svelte';
	import { edgePoints, type EdgeRoute, type Point } from '$lib/services/levelLayout';

	let {
		id,
		sourceX,
		sourceY,
		targetX,
		targetY,
		data,
		markerEnd,
		style,
		label,
		labelStyle,
		interactionWidth
	}: EdgeProps = $props();

	const CORNER = 8;

	// Collinear and repeated corners are dropped, so every remaining corner is a real turn
	function corners(points: Point[]): Point[] {
		const out: Point[] = [];
		for (const p of points) {
			const last = out[out.length - 1];
			if (last && last.x === p.x && last.y === p.y) continue;
			const prev = out[out.length - 2];
			const straight =
				prev && ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y));
			if (straight) {
				out[out.length - 1] = p;
				continue;
			}
			out.push(p);
		}
		return out;
	}

	function roundedPath(points: Point[]): string {
		const toward = (from: Point, to: Point, d: number): Point => {
			const len = Math.hypot(to.x - from.x, to.y - from.y);
			return { x: from.x + ((to.x - from.x) / len) * d, y: from.y + ((to.y - from.y) / len) * d };
		};
		let d = `M ${points[0].x},${points[0].y}`;
		for (let i = 1; i < points.length - 1; i++) {
			const [prev, at, next] = [points[i - 1], points[i], points[i + 1]];
			const r = Math.min(
				CORNER,
				Math.hypot(at.x - prev.x, at.y - prev.y) / 2,
				Math.hypot(next.x - at.x, next.y - at.y) / 2
			);
			const a = toward(at, prev, r);
			const b = toward(at, next, r);
			d += ` L ${a.x},${a.y} Q ${at.x},${at.y} ${b.x},${b.y}`;
		}
		const end = points[points.length - 1];
		return `${d} L ${end.x},${end.y}`;
	}

	const points = $derived(
		corners(
			edgePoints(data!.route as EdgeRoute, { x: sourceX, y: sourceY }, { x: targetX, y: targetY })
		)
	);
	const path = $derived(roundedPath(points));
	// The label sits on the longest stretch, where it covers the least of the turns
	const labelAt = $derived.by(() => {
		let best = { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2, length: -1 };
		for (let i = 1; i < points.length; i++) {
			const [a, b] = [points[i - 1], points[i]];
			const length = Math.hypot(b.x - a.x, b.y - a.y);
			if (length > best.length) best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, length };
		}
		return best;
	});
</script>

<BaseEdge
	{id}
	{path}
	labelX={labelAt.x}
	labelY={labelAt.y}
	{markerEnd}
	{style}
	{label}
	{labelStyle}
	{interactionWidth}
/>
