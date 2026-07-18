/// <reference types="audioworklet" />

const BATCH_SIZE = 13 * 128;

class CaptureProcessor extends AudioWorkletProcessor {
    stopped = false;
    buffer = new Float32Array(BATCH_SIZE);
    offset = 0;

    constructor() {
        super();
        this.port.onmessage = (e) => {
            if (e.data === 'stop') {
                this.stopped = true;
            }
        };
    }

    process(inputs: Float32Array[][]) {
        const samples = inputs[0]?.[0];
        if (!samples) {
            return !this.stopped;
        }

        if (this.offset + samples.length > this.buffer.length) {
            throw new Error('This should be impossible');
        }

        this.buffer.set(samples, this.offset);
        this.offset += samples.length;

        if (this.offset === this.buffer.length) {
            this.port.postMessage(this.buffer);
            this.offset = 0;
        }

        return !this.stopped;
    }

}

registerProcessor('capture', CaptureProcessor);
