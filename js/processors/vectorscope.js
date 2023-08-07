class Vectorscope extends AudioWorkletProcessor {
    constructor() {
        super();
        this.update = 20; // Millis between update
        this.skip = 2; // takes 1x bufferSize, then skips the next n - 1
        this.nextUpdate = this.update;
        this.index = 0; // current index in circular buffer
        this.bufferSize = this.update / 1000 * sampleRate;
        this.left = new Float32Array(this.bufferSize); // Circular buffer
        this.right = new Float32Array(this.bufferSize); // Circular buffer
        this.leftOut = new Float32Array(this.bufferSize / this.skip); // Output buffer
        this.rightOut = new Float32Array(this.bufferSize / this.skip); // Output buffer
        this.running = true;
        this.port.onmessage = event => {
            if (event.data.release) this.running = false;
            if (event.data.update && event.data.update != this.update) {
                this.update = Math.max(20, event.data.update);
                this.bufferSize = this.update / 1000 * sampleRate;
                this.left = new Float32Array(this.bufferSize);
                this.right = new Float32Array(this.bufferSize);
                this.leftOut = new Float32Array(this.bufferSize / this.skip);
                this.rightOut = new Float32Array(this.bufferSize / this.skip);
            }
            if (event.data.skip && event.data.skip != this.skip) {
                this.skip = Math.floor(Math.max(event.data.skip, 1));
                this.leftOut = new Float32Array(this.bufferSize / this.skip);
                this.rightOut = new Float32Array(this.bufferSize / this.skip);
            }
        };
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length != 2) return true;
        const left = input[0];
        const right = input[1];
        // Copy incoming values into the circular buffers
        let i = 0;
        const len = right.length;
        while (i < len) {
            this.right[this.index] = right[i];
            this.left[this.index] = left[i];
            this.index = (this.index + 1) % this.bufferSize;
            i++;
        }
        this.nextUpdate -= right.length;
        if (this.nextUpdate < 0) {
            // Copy the circular buffers into the output buffers.
            let j = 0;
            let i = 0;
            const len = this.bufferSize / this.skip;
            while (i < len) {
                j = (i + this.index) % this.bufferSize;
                this.leftOut[i] = this.left[j];
                this.rightOut[i] = this.right[j];
                i++;
            }
            this.nextUpdate = this.update / 1000 * sampleRate;
            this.port.postMessage({ left: this.leftOut, right: this.rightOut });
        }

        return this.running;
    }
}

registerProcessor("vectorscope", Vectorscope);