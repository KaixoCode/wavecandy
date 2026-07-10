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

function toLog(value, min, max) {
  return min * Math.pow(max / min, (value - min) / (max - min));
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

    this.settings.window = settings.window || 5;
    this.settings.log = settings.log || false;
    this.settings.enhanced = settings.enhanced || false;
    this.settings.range = settings.range || -61;
    this.settings.bands = settings.bands || 2048;
    this.settings.colors = settings.colors || [
      [0, 0, 0, 0], [60, 60, 179, 120], [239, 15, 0, 200], [255, 255, 40, 255], [255, 255, 255, 255]
    ];

    // Create the canvas to draw on
    this.extraCanvas = document.createElement('canvas');
    this.extraContext = this.extraCanvas.getContext('2d');
    this.extraCanvas.width = position[2];
    this.extraCanvas.height = position[3];
    this.extraCanvas.imageSmoothingEnabled = false;
    this.extraContext.imageSmoothingQuality = 'high';

    this.pixels = new Array(position[3]).fill(this.settings.range);

    // When the element is resized, the canvas should also resize
    this.element.resizeCallback = (w, h) => {
      this.canvas.width = w;
      this.canvas.height = h;
      this.extraCanvas.width = w;
      this.extraCanvas.height = h;

      this.pixels = new Array(h).fill(this.settings.range);
    };

    this.oversampleCounter = 0;
    this.pixels = null;

    this.drawCursor = 0;
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
    const useLog = !!this.settings.log;
    const nyquist = 0.5;
    const minFreq = 5e-4;
    const maxFreq = nyquist;
    const useEnhanced = !!this.settings.enhanced;

    this.context.globalCompositeOperation = "copy";
    this.context.drawImage(this.extraCanvas, 0, 0, width, height);

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
      const weight_dB = 3 * Math.log2(frequency / 2e-3);
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

      if (useLog) {
        const minLog = Math.log(minFreq);
        const maxLog = Math.log(maxFreq);

        return Math.exp(minLog + t * (maxLog - minLog));
      } else {
        return t * nyquist;
      }
    }

    const frequencyToY = (freq) => {
      const h = Math.max(1.0, height - 1.0);
      freq = clamp(freq, 5e-4, nyquist);

      if (useLog) {
        const minLog = Math.log(minFreq);
        const maxLog = Math.log(maxFreq);

        const t = (Math.log(freq) - minLog) / (maxLog - minLog);
        return h - t * h;
      } else {
        const t = freq / nyquist;
        return h - t * h;
      }
    }

    const drawOne = (frequency, magnitude, opacity = 1) => {
      const y = frequencyToY(frequency);
      const y1 = Math.floor(y);
      const y2 = Math.ceil(y);
      const lerp = y - y1;

      const linear = Math.pow(10, (magnitude + frequencyWeight(frequency)) / 20);

      const m1 = 20 * Math.log10(linear * (1 - lerp) * opacity);
      const m2 = 20 * Math.log10(linear * lerp * opacity);

      drawPixel(y1, m1);
      drawPixel(y2, m2);
    }

    if (useEnhanced) {
      for (let k = 0; k < binCount; ++k) {
        const frequency = frequencies[k];
        const magnitude = magnitudes[k];

        drawOne(frequency, magnitude);
      }
    } else {
      for (let y = 0; y < height; ++y) {
        const frequency = yToFrequency(y);
        const magnitude = getMagnitudeAtFrequency(frequency) + frequencyWeight(frequency);
        drawPixel(y, magnitude);
      }
    }

    if (drawNextLine) {
      this.extraContext.globalCompositeOperation = "copy";
      this.extraContext.drawImage(this.extraCanvas, -1, 0);
      this.extraContext.globalCompositeOperation = "source-over";
      this.currentImage = new ImageData(1, height);

      for (let y = 0; y < height; ++y) {
        const color = getColor(this.pixels[y] || minDb);
        const pixelIndex = y * 4;
        this.currentImage.data[pixelIndex] = color[0];
        this.currentImage.data[pixelIndex + 1] = color[1];
        this.currentImage.data[pixelIndex + 2] = color[2];
        this.currentImage.data[pixelIndex + 3] = color[3];
      }
      
      this.pixels = new Array(height).fill(minDb);
      this.extraContext.putImageData(this.currentImage, width - 1, 0);
    }
  }
}