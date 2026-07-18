<script lang="ts">
	import captureWorkletUrl from '$lib/audio/capture?url';
	import { encodePcmChunk } from '$lib/audio/encode';
	import {
		audioChunkMessage,
		averageLogprob,
		buildScribeUrl,
		type ScribeWord
	} from '$lib/audio/scribe';
	import Button from '$lib/Button.svelte';
	import TypedLine from '$lib/TypedLine.svelte';

	let streamState = $state<string>();
	let stream = $state.raw<MediaStream>();
	let sending = $state(false);
	let socketState = $state<'closed' | 'connecting' | 'open'>('closed');
	type Line = { text: string; lang?: string; done: boolean };
	let lines = $state<Line[]>([]);

	const MIN_CONFIDENCE = -1.5;
	let ctx: AudioContext | undefined;
	let source: MediaStreamAudioSourceNode | undefined;
	let node: AudioWorkletNode | undefined;
	let socket: WebSocket | undefined;

	const go = async () => {
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					channelCount: 1
				}
			});
		} catch (e) {
			if (!(e instanceof DOMException)) {
				throw e;
			}

			if (e.name !== 'NotAllowedError' && e.name !== 'NotFoundError') {
				throw e;
			}

			streamState = e.message;
			return;
		}

		if (!stream) {
			throw new Error('This should be impossible');
		}

		if (!ctx) {
			ctx = new AudioContext({ sampleRate: 16000 });
			await ctx.audioWorklet.addModule(captureWorkletUrl);
		}
		node = new AudioWorkletNode(ctx, 'capture');
		node.port.onmessage = (e: MessageEvent<Float32Array>) => {
			if (!sending) {
				return;
			}

			if (socket?.readyState !== WebSocket.OPEN) {
				return;
			}

			socket.send(audioChunkMessage(encodePcmChunk(e.data)));
		};
		source = ctx.createMediaStreamSource(stream);
		source.connect(node);
	};

	const stop = () => {
		if (!stream) {
			return;
		}

		sending = false;
		stream.getTracks().forEach((t) => t.stop());
		source?.disconnect();
		node?.port.postMessage('stop');
		stream = undefined;
		source = undefined;
		node = undefined;
		streamState = undefined;
	};

	const connect = async () => {
		const resp = await fetch('/api/token', {
			method: 'POST'
		});

		if (!resp.ok) {
			streamState = 'token mint failed';
			return;
		}

		const { token } = await resp.json();

		socket?.close();
		const s = new WebSocket(buildScribeUrl(token));
		socket = s;
		socketState = 'connecting';
		s.onopen = () => {
			if (socket === s) {
				socketState = 'open';
			}
		};
		s.onclose = () => {
			if (socket === s) {
				socketState = 'closed';
			}
		};
		s.onmessage = (e) => {
			const msg = JSON.parse(e.data);

			if (msg.message_type === 'partial_transcript') {
				const last = lines.at(-1);
				if (!last || last.done) {
					lines.push({ text: msg.text, done: false });
					return;
				}

				last.text = msg.text;
				return;
			}

			if (msg.message_type !== 'committed_transcript_with_timestamps') {
				return;
			}

			const last = lines.at(-1);
			const pending = last && !last.done ? last : undefined;

			const words: ScribeWord[] = msg.words ?? [];
			if (!msg.text.trim() || averageLogprob(words) < MIN_CONFIDENCE) {
				if (pending) {
					lines.pop();
				}
				return;
			}

			if (pending) {
				pending.text = msg.text;
				pending.lang = msg.language_code ?? '??';
				pending.done = true;
				return;
			}

			lines.push({ text: msg.text, lang: msg.language_code ?? '??', done: true });
		};
	};
</script>

<main class="mx-auto max-w-xl space-y-6 p-6">
	<h1 class="text-xl font-semibold">Translator</h1>

	<div class="flex gap-2">
		{#if !stream}
			<Button onclick={go}>start mic</Button>
		{:else}
			<Button onclick={stop}>stop mic</Button>
		{/if}

		<Button onclick={connect} disabled={socketState !== 'closed'}>connect</Button>

		{#if !sending}
			<Button onclick={() => (sending = true)}>start sending</Button>
		{:else}
			<Button onclick={() => (sending = false)}>stop sending</Button>
		{/if}
	</div>

	<dl class="grid grid-cols-[auto_1fr] gap-x-4 text-sm">
		<dt>mic</dt>
		<dd>{stream ? 'on' : 'off'}</dd>
		<dt>socket</dt>
		<dd>{socketState}</dd>
		<dt>sending</dt>
		<dd>{sending ? 'yes' : 'no'}</dd>
	</dl>

	{#if streamState}
		<p class="text-sm">{streamState}</p>
	{/if}

	<section class="space-y-2">
		<h2 class="text-sm font-semibold">Transcript</h2>
		{#each lines as line, i (i)}
			<p>
				{#if line.lang}<span class="font-semibold">{line.lang}:</span>{/if}
				<TypedLine text={line.text} />
			</p>
		{/each}
		{#if !lines.length}
			<p class="text-sm italic">nothing yet</p>
		{/if}
	</section>
</main>
