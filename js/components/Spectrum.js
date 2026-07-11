function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function intensityToColor(intensity, colors) {
  const q = Math.min(colors.length - 1, (colors.length - 1) * intensity);
  let i = 0;
  let res = [0, 0, 0, 0];
  const len = colors.length;
  while (i < len) {
    const r = 1 - Math.min(1, Math.abs(q - i));
    res[0] += r * colors[i][0];
    res[1] += r * colors[i][1];
    res[2] += r * colors[i][2];
    res[3] += r * colors[i][3];
    i++;
  }
  res[0] = Math.min(255, Math.max(0, res[0]));
  res[1] = Math.min(255, Math.max(0, res[1]));
  res[2] = Math.min(255, Math.max(0, res[2]));
  res[3] = Math.min(255, Math.max(0, res[3]));
  return res;
}

class Spectrum extends Component {
  constructor(processor, position, settings) {
    super(processor, position, settings, "spectrum", false);
    delete this.settings.lowpass;
    delete this.settings.highpass;
    delete this.settings.lowpassFrequency;
    delete this.settings.highpassFrequency;
    delete this.settings.color;

    this.oversample = 3;

    this.settings.slide = settings.slide || 1;
    this.settings.window = settings.window || 5;
    this.settings.log = settings.log || false;
    this.settings.enhanced = settings.enhanced || false;
    this.settings.range = settings.range || -61;
    this.settings.bands = settings.bands || 2048;
    this.settings.colors = settings.colors || [
      [0, 0, 0, 0], [60, 60, 179, 120], [239, 15, 0, 200], [255, 255, 40, 255], [255, 255, 255, 255]
    ];

    this.pixels = new Array(position[3]).fill(this.settings.range);
    this.prevPixels = new Array(position[3]).fill(this.settings.range);

    // When the element is resized, the canvas should also resize
    this.element.resizeCallback = (w, h) => {
      this.canvas.width = w;
      this.canvas.height = h;

      this.pixels = new Array(h).fill(this.settings.range);
    };

    this.oversampleCounter = 0;
    this.updateColorLookup();
  }

  updateColorLookup() {
    this.colorLookup = [];
    for (let i = 0; i < 256; ++i) {
      this.colorLookup[i] = intensityToColor(i / 255, this.settings.colors);
    }
  }

  async updateSettings() {
    this.element.style.backgroundColor = this.settings.background;

    this.updateColorLookup();

    this.node.port.postMessage({
      oversample: this.oversample,
      fftSize: this.settings.bands,
      window: this.settings.window,
    });
  }

  async draw(data) {
    const frequencies = data.frequencies || [];
    const magnitudes = data.magnitudes || [];

    const width = Math.max(1, this.canvas.width);
    const height = Math.max(1, this.canvas.height);

    const minDb = this.settings.range;
    const maxDb = 0;
    const binCount = magnitudes.length;
    const log = !!this.settings.log;
    const f0 = 1e-3;
    const nyquist = 0.5;
    const useEnhanced = !!this.settings.enhanced;
    const slide = this.settings.slide;

    const getColor = (value) => {
      const clamped = clamp(value, minDb, maxDb);
      const intensity = (clamped - minDb) / (maxDb - minDb);
      return this.colorLookup[Math.round(clamped === minDb ? 0 : intensity * 255)] || this.colorLookup[0];
    };

    this.oversampleCounter++;
    let drawNextLine = false;
    if (this.oversampleCounter >= this.oversample) {
      this.oversampleCounter = 0;
      drawNextLine = true;
    }

    const drawPixel = (y, value) => {
      this.pixels[y] = Math.max(this.pixels[y], value);
    };

    const frequencyWeight = (frequency) => {
      const weight_dB = 3 * Math.log2(frequency / 1e-3);
      return weight_dB;
    }

    const getMagnitudeAtFrequency = (frequency) => {
      if (!binCount) return minDb;

      const clamped = clamp(frequency, 0, nyquist);
      const index = clamp((clamped / nyquist) * (binCount - 1), 0, binCount - 1);
      const lower = Math.floor(index);
      const upper = Math.min(binCount - 1, lower + 1);
      const blend = index - lower;
      const lowerMagnitude = magnitudes[lower] ?? minDb;
      const upperMagnitude = magnitudes[upper] ?? minDb;
      return lowerMagnitude + (upperMagnitude - lowerMagnitude) * blend;
    };

    const yToFrequency = (y) => {
      const h = Math.max(1, height - 1);
      const t = (h - y) / h;
      
      const logPos = f0 * (Math.pow((nyquist + f0) / f0, t) - 1);
      const linPos = nyquist * t;
      
      return linPos * (1 - log) + logPos * log;
    }

    const frequencyToY = (freq) => {
      const h = Math.max(1.0, height - 1.0);
      freq = clamp(freq, 0, nyquist);

      const logPos = Math.log(freq / f0 + 1) / Math.log((nyquist + f0) / f0);
      const linPos = freq / nyquist;

      const t = linPos * (1 - log) + logPos * log;
      return h - t * h;
    }

    if (useEnhanced) {
      for (let k = 0; k < binCount; ++k) {
        const frequency = frequencies[k];
        const magnitude = magnitudes[k] + frequencyWeight(frequency);

        const y = frequencyToY(frequency);
        const y1 = Math.floor(y);
        const y2 = Math.ceil(y);
        const lerp = y - y1;

        const linear = Math.pow(10, magnitude / 20);

        const m1 = 20 * Math.log10(linear * (1 - lerp));
        const m2 = 20 * Math.log10(linear * lerp);

        drawPixel(y1, m1);
        drawPixel(y2, m2);
      }
    } else {
      for (let y = 0; y < height; ++y) {
        const frequency = yToFrequency(y);
        const magnitude = getMagnitudeAtFrequency(frequency) + frequencyWeight(frequency);
        drawPixel(y, magnitude);
      }
    }

    if (drawNextLine) {
      this.context.globalCompositeOperation = "copy";
      this.context.drawImage(this.canvas, -slide, 0);
      this.context.globalCompositeOperation = "source-over";
      this.currentImage = new ImageData(slide, height);

      for (let x = 0; x < slide; ++x) {
        const lerp = (x + 1) / slide;
        for (let y = 0; y < height; ++y) {
          const decibelsA = this.prevPixels[y] || minDb;
          const decibelsB = this.pixels[y] || minDb;
          const decibels = decibelsA * (1 - lerp) + decibelsB * lerp;
          const color = getColor(decibels);
          const pixelIndex = (y * slide + x) * 4;
          this.currentImage.data[pixelIndex] = color[0];
          this.currentImage.data[pixelIndex + 1] = color[1];
          this.currentImage.data[pixelIndex + 2] = color[2];
          this.currentImage.data[pixelIndex + 3] = color[3];
        }
      }
      
      this.prevPixels = Array.from(this.pixels);
      this.pixels = new Array(height).fill(minDb);
      this.context.putImageData(this.currentImage, width - slide, 0);
    }
  }
}