
class Oscilloscope extends Component {
  constructor(processor, position, settings) {
    super(processor, position, settings, "oscilloscope");
    this.settings.mono = settings.mono || false;
    this.settings.update = settings.update || 50;
    this.settings.window = settings.window || 500;
    this.settings.stroke = settings.stroke || 1;
  }

  async draw(data) {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.fillStyle = this.settings.color;
    this.context.strokeStyle = this.settings.color;
    this.context.lineWidth = this.settings.stroke;
    const wave = (data, x, y, w, h) => {
      const _yf = y + (-data.min[0] * 0.5 + 0.5) * h;
      const _xf = x;
      this.context.moveTo(_xf, _yf);
      let i = 1;
      const len = data.min.length;
      while (i < len) {
        const _y = y + (-data.min[i] * 0.5 + 0.5) * h;
        const _x = x + (i / data.min.length) * w;
        this.context.lineTo(_x, _y);
        i += 1;
      }
      i = data.max.length - 1;
      while (i >= 0) {
        const _y = y + (-data.max[i] * 0.5 + 0.5) * h;
        const _x = x + (i / data.max.length) * w;
        this.context.lineTo(_x, _y);
        i -= 1;
      }
    };
    const monowave = (data1, data2, x, y, w, h) => {
      const _yf = y + (-Math.min(data1.min[0], data2.min[0]) * 0.5 + 0.5) * h;
      const _xf = x;
      this.context.moveTo(_xf, _yf);
      let i = 1;
      const len = data1.min.length;
      while (i < len) {
        const _y = y + (-Math.min(data1.min[i], data2.min[i]) * 0.5 + 0.5) * h;
        const _x = x + (i / data1.min.length) * w;
        this.context.lineTo(_x, _y);
        i += 1;
      }
      i = data1.max.length - 1;
      while (i >= 0) {
        const _y = y + (-Math.max(data1.max[i], data2.max[i]) * 0.5 + 0.5) * h;
        const _x = x + (i / data1.max.length) * w;
        this.context.lineTo(_x, _y);
        i -= 1;
      }
    };
    const padding = 3;
    if (this.settings.mono) {
      this.context.beginPath();
      monowave(data.left, data.right, 0.5, padding, this.canvas.width, this.canvas.height - 2 * padding);
      this.context.closePath();
      this.context.fill();
      this.context.stroke();
    } else {
      this.context.beginPath();
      wave(data.left, 0.5, padding, this.canvas.width, this.canvas.height / 2 - padding * 1.5);
      wave(data.right, 0.5, this.canvas.height / 2 + padding * 0.5, this.canvas.width, this.canvas.height / 2 - padding * 1.5);
      this.context.closePath();
      this.context.fill();
      this.context.stroke();
    }
  }
}