<script lang="ts">
	// Hero illustration — Stitch "Ropeman Landing - Hero Redesign v2" (landing-hero-redesign-v2.html)
	// Three glass-panel nodes (AppContainer / AuthModule / DataStore) connected by
	// dashed cubic edges, with a pulsing primary glow anchored to the center.
</script>

<div class="hero-illustration" aria-hidden="true">
	<!-- Radial glow backdrop -->

	<!-- SVG edges (dashed, colored like ZUICanvas edges) -->
	<svg class="hero-edges" viewBox="0 0 400 400" preserveAspectRatio="none">
		<path
			class="edge"
			d="M120 150 Q 200 100 280 150"
			fill="none"
			stroke="var(--accent)"
			stroke-dasharray="4 4"
			stroke-width="1.5"
			opacity="0.6"
		/>
		<path
			class="edge"
			d="M120 150 Q 200 250 280 250"
			fill="none"
			stroke="var(--accent)"
			stroke-dasharray="4 4"
			stroke-width="1.5"
			opacity="0.4"
		/>
		<path
			class="edge"
			d="M280 150 Q 320 200 280 250"
			fill="none"
			stroke="var(--accent)"
			stroke-dasharray="4 4"
			stroke-width="1.5"
			opacity="0.6"
		/>
	</svg>

	<!-- Central pulse -->

	<!-- Node 1 — AppContainer (primary) -->
	<div class="hero-node pos-tl">
		<div class="node-bar" style="background: var(--accent);"></div>
		<div class="node-title">App Container</div>
		<div class="node-sub">Primary Entry Point</div>
	</div>

	<!-- Node 2 — AuthModule (secondary) -->
	<div class="hero-node pos-tr">
		<div class="node-bar" style="background: var(--accent);"></div>
		<div class="node-title">Auth Module</div>
		<div class="node-sub">JWT / Middleware</div>
	</div>

	<!-- Node 3 — DataStore (tertiary) -->
	<div class="hero-node pos-br">
		<div class="node-bar" style="background: var(--accent);"></div>
		<div class="node-title">Data Store</div>
		<div class="node-sub">State Management</div>
	</div>
</div>

<style>
	.hero-illustration {
		position: relative;
		width: 100%;
		height: 500px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.hero-edges {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.hero-node {
		position: absolute;
		width: 140px;
		padding: 12px;
		background: var(--bg-highest);
		border: 1px solid var(--border);
		border-radius: 8px;
		box-shadow:
			0 1px 2px rgba(0, 0, 0, 0.08),
			0 8px 24px rgba(0, 0, 0, 0.16);
		z-index: 2;
	}

	.pos-tl {
		top: 120px;
		left: 60px;
	}

	.pos-tr {
		top: 120px;
		right: 40px;
	}

	.pos-br {
		bottom: 120px;
		right: 60px;
	}

	.node-bar {
		height: 4px;
		width: 32px;
		border-radius: 999px;
		margin-bottom: 8px;
	}

	.node-title {
		font-family: var(--font-display, 'Space Grotesk', sans-serif);
		font-size: 12px;
		font-weight: 600;
		color: var(--text-primary, #f1f3fc);
		line-height: 1.2;
	}

	.node-sub {
		margin-top: 2px;
		font-family: var(--font-body, 'Inter', sans-serif);
		font-size: 11px;
		color: var(--text-muted);
		line-height: 1.3;
	}

	@media (max-width: 1024px) {
		.hero-illustration {
			display: none;
		}
	}
</style>
