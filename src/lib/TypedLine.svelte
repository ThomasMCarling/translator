<script lang="ts">
	let { text }: { text: string } = $props();
	let shown = $state('');

	$effect(() => {
		void text;
		const timer = setInterval(() => {
			if (shown === text) {
				clearInterval(timer);
				return;
			}

			if (text.startsWith(shown)) {
				shown = text.slice(0, shown.length + 1);
				return;
			}

			shown = shown.slice(0, -1);
		}, 20);

		return () => clearInterval(timer);
	});
</script>

<span>{shown}</span>
