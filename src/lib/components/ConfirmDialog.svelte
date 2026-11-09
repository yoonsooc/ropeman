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
		background: var(--bg-primary);
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow:
			0 1px 2px rgba(0, 0, 0, 0.08),
			0 8px 24px rgba(0, 0, 0, 0.16);
	}

	.confirm-dialog::backdrop {
		background: var(--modal-backdrop);
	}

	.confirm-body {
		padding: 20px;
	}

	.confirm-title {
		font-size: 16px;
		font-weight: 600;
		line-height: 1.3;
	}

	.confirm-message {
		margin-top: 8px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 20px;
	}
</style>
