import { describe, expect, it } from 'vitest';
import { encodePcmChunk } from './encode';
import { audioChunkMessage, averageLogprob, buildScribeUrl } from './scribe';

const decode = (base64: string): Int16Array => {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new Int16Array(bytes.buffer);
};

describe('encodePcmChunk', () => {
	it('encodes silence as zeros', () => {
		const result = decode(encodePcmChunk(new Float32Array(4)));
		expect([...result]).toEqual([0, 0, 0, 0]);
	});

	it('scales full-range samples to int16 extremes', () => {
		const result = decode(encodePcmChunk(new Float32Array([1, -1])));
		expect([...result]).toEqual([32767, -32767]);
	});

	it('clamps out-of-range samples', () => {
		const result = decode(encodePcmChunk(new Float32Array([1.5, -1.5])));
		expect([...result]).toEqual([32767, -32767]);
	});

	it('rounds intermediate values', () => {
		const result = decode(encodePcmChunk(new Float32Array([0.5])));
		expect([...result]).toEqual([16384]);
	});

	it('produces two bytes per sample', () => {
		const base64 = encodePcmChunk(new Float32Array(1664));
		expect(atob(base64).length).toBe(3328);
	});

	it('encodes an empty chunk as an empty string', () => {
		expect(encodePcmChunk(new Float32Array(0))).toBe('');
	});
});

describe('buildScribeUrl', () => {
	it('targets the realtime endpoint with the token and model', () => {
		const url = new URL(buildScribeUrl('sutkn_123'));
		expect(url.protocol).toBe('wss:');
		expect(url.pathname).toBe('/v1/speech-to-text/realtime');
		expect(url.searchParams.get('token')).toBe('sutkn_123');
		expect(url.searchParams.get('model_id')).toBe('scribe_v2_realtime');
	});

	it('enables vad commits, language detection and timestamps', () => {
		const url = new URL(buildScribeUrl('t'));
		expect(url.searchParams.get('commit_strategy')).toBe('vad');
		expect(url.searchParams.get('include_language_detection')).toBe('true');
		expect(url.searchParams.get('include_timestamps')).toBe('true');
	});
});

describe('audioChunkMessage', () => {
	it('wraps the base64 payload in the scribe message shape', () => {
		expect(JSON.parse(audioChunkMessage('abc'))).toEqual({
			message_type: 'input_audio_chunk',
			audio_base_64: 'abc',
			sample_rate: 16000
		});
	});
});

describe('averageLogprob', () => {
	it('averages word logprobs and ignores spacing', () => {
		const words = [
			{ text: 'a', type: 'word', logprob: -0.2 },
			{ text: ' ', type: 'spacing', logprob: 0 },
			{ text: 'b', type: 'word', logprob: -0.4 }
		];
		expect(averageLogprob(words)).toBeCloseTo(-0.3);
	});

	it('returns -Infinity for no words', () => {
		expect(averageLogprob([])).toBe(-Infinity);
	});
});
