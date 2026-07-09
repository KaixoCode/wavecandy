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

    this.context.imageSmoothingEnabled = false;
    this.settings.window = settings.window || 5;
    this.settings.log = settings.log || false;
    this.settings.range = settings.range || -61;
    this.settings.bands = settings.bands || 2048;
    this.settings.colors = settings.colors || [
      [0, 0, 0, 0], [60, 60, 179, 120], [239, 15, 0, 200], [255, 255, 40, 255], [255, 255, 255, 255]
    ];

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
    const drawWidth = 1;

    this.context.globalCompositeOperation = "copy";
    this.context.drawImage(this.canvas, -drawWidth, 0);
    this.context.globalCompositeOperation = "source-over";
    this.currentImage = new ImageData(drawWidth, height);

    const getColor = (value) => {
      const clamped = clamp(value, minDb, maxDb);
      const intensity = (clamped - minDb) / (maxDb - minDb);
      return this.colorLookup[Math.round(clamped === minDb ? 0 : intensity * 255)] || this.colorLookup[0];
    };

    const drawPixel = (x, y, value) => {
      const color = getColor(value);
      const pixelIndex = (y * drawWidth + x) * 4;
      this.currentImage.data[pixelIndex] = color[0];
      this.currentImage.data[pixelIndex + 1] = color[1];
      this.currentImage.data[pixelIndex + 2] = color[2];
      this.currentImage.data[pixelIndex + 3] = color[3];
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

    for (let x = 0; x < drawWidth; ++x) {
      for (let y = 0; y < height; ++y) {
        const frequency = useLog ? Math.exp(Math.log(5e-4) + ((height - 1 - y) / Math.max(1, height - 1)) * (Math.log(nyquist) - Math.log(5e-4))) : ((height - 1 - y) / Math.max(1, height - 1)) * nyquist;
        const magnitude = getMagnitudeAtFrequency(frequency) + frequencyWeight(frequency);
        drawPixel(x, y, magnitude);
      }
    }

    this.context.putImageData(this.currentImage, width - drawWidth, 0);
  }
}