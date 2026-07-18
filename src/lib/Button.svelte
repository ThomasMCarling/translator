<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	const { children, class: className, ...rest }: HTMLButtonAttributes = $props();
</script>

<button
	class={[
		'disabled:opacity-50, rounded border px-3 py-1 hover:bg-neutral-100 disabled:hover:bg-transparent',
		className
	]}
	{...rest}>{@render children?.()}</button
>
