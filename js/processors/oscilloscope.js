class Oscilloscope extends AudioWorkletProcessor {
    constructor() {
        super();
        this.window = 500; // Millis of data visible
        this.update = 50; // Millis between update
        this.width = 500; // Amount of datapoints to return
        this.nextUpdate = this.update;
        this.index = 0; // Index in circular buffer
        this.bufferSize = this.window / 1000 * sampleRate;
        this.left = new Float32Array(this.bufferSize);
        this.right = new Float32Array(this.bufferSize);
        this.pLeftMin = new Float32Array(this.width);
        this.pLeftMax = new Float32Array(this.width);
        this.pRightMin = new Float32Array(this.width);
        this.pRightMax = new Float32Array(this.width);
        this.running = true;
        this.port.onmessage = event => {
            if (event.data.release) this.running = false;
            if (event.data.width && event.data.width != this.width) {
                this.width = event.data.width;
                this.pLeftMin = new Float32Array(this.width);
                this.pLeftMax = new Float32Array(this.width);
                this.pRightMin = new Float32Array(this.width);
                this.pRightMax = new Float32Array(this.width);
            }
            if (event.data.update && event.data.update != this.update) {
                this.update = Math.max(event.data.update, 20);
            }
            if (event.data.window && event.data.window != this.window) {
                this.window = Math.floor(Math.max(event.data.window, 1));
                this.bufferSize = Math.floor(this.window / 1000 * sampleRate);
                this.left = new Float32Array(this.bufferSize);
                this.right = new Float32Array(this.bufferSize);
            }
        };
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length != 2) return true;
        const left = input[0];
        const right = input[1];
        // Copy incoming data into circular buffers
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
            // Fill output buffers with -1/1
            this.pRightMax.fill(-1, 0, this.width);
            this.pRightMin.fill(1, 0, this.width);
            this.pLeftMax.fill(-1, 0, this.width);
            this.pLeftMin.fill(1, 0, this.width);
            // Find mins and maxs
            let j = 0;
            let i = 0;
            if (this.bufferSize < this.width) {
                let index = 0;
                const len = this.width;
                while (i < len) {
                    index = Math.floor((i / this.width) * this.bufferSize);
                    j = (index + this.index) % this.bufferSize;
                    this.pLeftMax[i] = this.left[j];
                    this.pLeftMin[i] = this.left[j];
                    this.pRightMax[i] = this.right[j];
                    this.pRightMin[i] = this.right[j];
                    i++;
                }
            } else {
                let index = 0;
                const len = this.bufferSize;
                while (i < len) {
                    index = Math.floor((i / this.bufferSize) * this.width);
                    j = (i + this.index) % this.bufferSize;
                    if (this.left[j] > this.pLeftMax[index]) this.pLeftMax[index] = this.left[j];
                    if (this.left[j] < this.pLeftMin[index]) this.pLeftMin[index] = this.left[j];
                    if (this.right[j] > this.pRightMax[index]) this.pRightMax[index] = this.right[j];
                    if (this.right[j] < this.pRightMin[index]) this.pRightMin[index] = this.right[j];
                    i++;
                }
            }
            this.nextUpdate = this.update / 1000 * sampleRate;
            this.port.postMessage({ left: { max: this.pLeftMax, min: this.pLeftMin }, right: { max: this.pRightMax, min: this.pRightMin } });
        }

        return this.running;
    }
}

registerProcessor("oscilloscope", Oscilloscope);