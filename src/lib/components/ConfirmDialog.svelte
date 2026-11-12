<script lang="ts">
	let {
		open,
		title,
		message,
		confirmLabel,
		cancelLabel,
		onconfirm,
		oncancel
	}: {
		open: boolean;
		title: string;
		message: string;
		confirmLabel: string;
		cancelLabel: string;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state(undefined);

	// Native <dialog> traps focus, makes the page inert and returns focus to the opener
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === dialog) oncancel();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialog}
	class="confirm-dialog"
	aria-labelledby="confirm-dialog-title"
	aria-describedby="confirm-dialog-message"
	oncancel={(e) => {
		e.preventDefault();
		oncancel();
	}}
	onclick={handleBackdropClick}
>
	<div class="confirm-body">
		<h2 id="confirm-dialog-title" class="confirm-title">{title}</h2>
		<p id="confirm-dialog-message" class="confirm-message">{message}</p>
		<div class="confirm-actions">
			<button type="button" class="btn btn-secondary" onclick={oncancel}>{cancelLabel}</button>
			<button type="button" class="btn btn-primary" onclick={onconfirm}>{confirmLabel}</button>
		</div>
	</div>
</dialog>

<style>
	.confirm-dialog {
		margin: auto;
		width: min(400px, calc(100vw - 32px));
		padding: 0;
		background: var(--color-background-body);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-container);
		box-shadow: var(--shadow-high);
	}

	.confirm-dialog::backdrop {
		background: var(--color-overlay);
	}

	.confirm-body {
		padding: var(--spacing-5);
	}

	.confirm-title {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		line-height: 1.3;
	}

	.confirm-message {
		margin-top: var(--spacing-2);
		font-size: var(--font-size-base);
		line-height: 1.5;
		color: var(--color-text-secondary);
	}

	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-2);
		margin-top: var(--spacing-5);
	}
</style>
