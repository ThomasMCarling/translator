const SCRIBE_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';

export type ScribeWord = {
	text: string;
	type: string;
	logprob: number;
};

export const averageLogprob = (words: ScribeWord[]): number => {
	const scored = words.filter((w) => w.type === 'word');
	if (!scored.length) {
		return -Infinity;
	}

	return scored.reduce((sum, w) => sum + w.logprob, 0) / scored.length;
};

export const buildScribeUrl = (token: string): string => {
	const params = new URLSearchParams({
		model_id: 'scribe_v2_realtime',
		token,
		commit_strategy: 'vad',
		include_language_detection: 'true',
		include_timestamps: 'true'
	});

	return `${SCRIBE_URL}?${params}`;
};

export const audioChunkMessage = (base64: string): string =>
	JSON.stringify({
		message_type: 'input_audio_chunk',
		audio_base_64: base64,
		sample_rate: 16000
	});
