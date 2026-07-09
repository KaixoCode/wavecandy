class Spectrum extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fftSize = 2048;
    this.window = 10;
    this.hopSize = Math.max(1, Math.floor(sampleRate * this.window / 1000.0));
    this.running = true;
    this.frameBuffer = new Float32Array(this.fftSize);
    this.frameBufferIndex = 0;
    this.frameBufferFill = 0;
    this.hopAccumulator = 0;
    this.previousPhase = new Float32Array(this.fftSize / 2);
    this.frequencies = new Float32Array(this.fftSize / 2);
    this.magnitudes = new Float32Array(this.fftSize / 2);
    this.port.onmessage = event => {
      if (event.data.release) {
        this.running = false;
        return;
      }
      if (event.data.fftSize) {
        this.fftSize = Math.max(32, event.data.fftSize);
        this.frameBuffer = new Float32Array(this.fftSize);
        this.window = event.data.window;
        this.hopSize = Math.max(1, Math.floor(sampleRate * this.window / 1000.0));
        this.frameBufferIndex = 0;
        this.frameBufferFill = 0;
        this.hopAccumulator = 0;
        this.previousPhase = new Float32Array(this.fftSize / 2);
        this.frequencies = new Float32Array(this.fftSize / 2);
        this.magnitudes = new Float32Array(this.fftSize / 2);
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this.running) return false;
    
    const input = inputs[0];
    if (input.length != 2) return true;

    const left = input[0];
    const right = input[1];

    for (let i = 0; i < left.length; ++i) {
      this.frameBuffer[this.frameBufferIndex] = (left[i] + right[i]) / 2;
      this.frameBufferIndex = (this.frameBufferIndex + 1) % this.fftSize;
      if (this.frameBufferFill < this.fftSize) this.frameBufferFill += 1;
      this.hopAccumulator += 1;
      if (this.hopAccumulator >= this.hopSize && this.frameBufferFill === this.fftSize) {
        this.hopAccumulator -= this.hopSize;
        this.computeFrame();
      }
    }

    return true;
  }

  fft(real, imag) {
    let n = real.length;
    let j = 0;
    for (let i = 1; i < n; ++i) {
      let bit = n >> 1;
      while (j & bit) {
        j ^= bit;
        bit >>= 1;
      }
      j ^= bit;
      if (i < j) {
        const tmpReal = real[i];
        real[i] = real[j];
        real[j] = tmpReal;
        const tmpImag = imag[i];
        imag[i] = imag[j];
        imag[j] = tmpImag;
      }
    }

    let len = 2;
    while (len <= n) {
      const angle = -2 * Math.PI / len;
      const wlenCos = Math.cos(angle);
      const wlenSin = Math.sin(angle);
      for (let i = 0; i < n; i += len) {
        let wCos = 1;
        let wSin = 0;
        const half = len / 2;
        for (let j = 0; j < half; ++j) {
          const uReal = real[i + j];
          const uImag = imag[i + j];
          const vReal = real[i + j + half] * wCos - imag[i + j + half] * wSin;
          const vImag = real[i + j + half] * wSin + imag[i + j + half] * wCos;
          real[i + j] = uReal + vReal;
          imag[i + j] = uImag + vImag;
          real[i + j + half] = uReal - vReal;
          imag[i + j + half] = uImag - vImag;
          const nextCos = wCos * wlenCos - wSin * wlenSin;
          const nextSin = wCos * wlenSin + wSin * wlenCos;
          wCos = nextCos;
          wSin = nextSin;
        }
      }
      len <<= 1;
    }
  }

  computeFrame() {
    const real = new Float32Array(this.fftSize);
    const imag = new Float32Array(this.fftSize);
    const frameCount = Math.min(this.frameBufferFill, this.fftSize);
    const startIndex = (this.frameBufferIndex + this.fftSize - frameCount) % this.fftSize;
    for (let i = 0; i < this.fftSize; ++i) {
      const sample = i < frameCount ? this.frameBuffer[(startIndex + i) % this.fftSize] : 0;
      const windowValue = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (this.fftSize - 1));
      real[i] = sample * windowValue;
    }

    this.fft(real, imag);

    const magnitudes = new Float32Array(this.fftSize / 2);
    const frequencies = new Float32Array(this.fftSize / 2);
    for (let k = 0; k < this.fftSize / 2; ++k) {
      const magnitude = Math.hypot(real[k], imag[k]) / (this.fftSize / 2);
      const magnitudeDb = 20 * Math.log10(Math.max(magnitude, 1e-12));
      const phase = Math.atan2(imag[k], real[k]);

      magnitudes[k] = magnitudeDb;

      const binCenter = k / this.fftSize;
      const binSpacing = 1 / this.fftSize;
      
      if (this.previousPhase[k] !== 0) {
        const phaseDiff = phase - this.previousPhase[k];
        const expectedPhaseAdvance = (2 * Math.PI * k * this.hopSize) / this.fftSize;
        const phaseDeviation = phaseDiff - expectedPhaseAdvance;
        const phaseDeviationWrapped = phaseDeviation % (2 * Math.PI);
        
        const actualFrequency = binCenter + phaseDeviationWrapped / (2 * Math.PI * this.hopSize);
        frequencies[k] = actualFrequency;
      } else {
        frequencies[k] = binCenter;
      }

      this.previousPhase[k] = phase;
    }

    this.magnitudes = magnitudes;
    this.frequencies = frequencies;
    this.port.postMessage({ magnitudes: this.magnitudes, frequencies: this.frequencies });
  }
}

registerProcessor("spectrum", Spectrum);
