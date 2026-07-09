
class Vectorscope extends Component {
  constructor(processor, position, settings) {
    super(processor, position, settings, "vectorscope")
    this.settings.rulerOpacity = settings.rulerOpacity || 1;
    this.settings.ruler = settings.ruler || "#111111";
    this.settings.thickness = settings.thickness || 1.7;
    this.settings.opacity = settings.opacity || 0.5;
    this.settings.skip = settings.skip || 2;
    this.settings.update = settings.update || 20;
  }

  async draw(data) {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    let i = 0;
    const padding = 3;
    const width = this.canvas.width - 2 * padding;
    const height = this.canvas.height - 2 * padding;
    const bars = 5;
    const angle = 0.25 * Math.PI;
    const diff = 0.125 * Math.PI;
    const radiusX = width / 2;
    const radiusY = height / 2;
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;

    this.context.globalAlpha = this.settings.rulerOpacity;
    const gradient = this.context.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, radiusY);
    gradient.addColorStop(0.1, this.settings.ruler + "00");
    gradient.addColorStop(0.4, this.settings.ruler + "FF");
    gradient.addColorStop(0.6, this.settings.ruler + "FF");
    gradient.addColorStop(1, this.settings.ruler + "00");

    this.context.lineWidth = 4;
    this.context.strokeStyle = gradient;
    this.context.beginPath();
    while (i < bars) {
      const curr = angle + diff * i;
      const x1 = centerX + Math.cos(curr) * radiusX;
      const y1 = centerY + Math.sin(curr) * radiusY;
      const x2 = centerX - Math.cos(curr) * radiusX;
      const y2 = centerY - Math.sin(curr) * radiusY;

      this.context.moveTo(x1, y1);
      this.context.lineTo(x2, y2);
      this.context.closePath();

      i++;
    }
    this.context.stroke();
    this.context.globalAlpha = 1;

    this.context.fillStyle = this.settings.color;
    this.context.globalAlpha = this.settings.opacity;
    i = 0;
    const _s = Math.sin(3.14159 * 0.25);
    const _c = Math.cos(3.14159 * 0.25);
    const len = data.left.length;
    while (i < len) {
      const left = data.left[i];
      const right = data.right[i];
      const xn = (left * _c - right * _s) * 0.70710678118;
      const yn = (left * _s + right * _c) * 0.70710678118;
      const x = padding + (xn * 0.5 + 0.5) * width - this.settings.thickness;
      const y = padding + (yn * 0.5 + 0.5) * height - this.settings.thickness;
      this.context.fillRect(x, y, this.settings.thickness * 2, this.settings.thickness * 2);
      i++;
    }

    this.context.globalAlpha = 1;
  }
}
