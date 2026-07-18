export const encodePcmChunk = (samples: Float32Array): string => {
	const pcm = new Int16Array(samples.length);
	for (let i = 0; i < samples.length; i++) {
		const clamped = Math.max(-1, Math.min(1, samples[i]));
		pcm[i] = Math.round(clamped * 32767);
	}

	const bytes = new Uint8Array(pcm.buffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}

	return btoa(binary);
};
