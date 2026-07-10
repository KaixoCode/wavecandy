
class Oscilloscope extends Component {
  constructor(processor, position, settings) {
    super(processor, position, settings, "oscilloscope");
    this.settings.mono = settings.mono ?? false;
    this.settings.update = settings.update ?? 50;
    this.settings.window = settings.window ?? 500;
    this.settings.stroke = settings.stroke ?? 1;
  }

  drawWave(data, x, y, segmentWidth, h) {
    const min = data.min;
    const max = data.max;
    const len = min.length;
    const steps = Math.max(1, segmentWidth);
    const start = Math.max(0, len - steps);

    this.context.beginPath();
    this.context.moveTo(x, y + (-min[start] * 0.5 + 0.5) * h);

    let i = 1;
    while (i < steps) {
      const index = start + i;
      const _y = y + (-min[index] * 0.5 + 0.5) * h;
      const _x = x + i;
      this.context.lineTo(_x, _y);
      i += 1;
    }

    i = steps - 1;
    while (i >= 0) {
      const index = start + i;
      const _y = y + (-max[index] * 0.5 + 0.5) * h;
      const _x = x + i;
      this.context.lineTo(_x, _y);
      i -= 1;
    }

    this.context.closePath();
  }

  drawMonoWave(data1, data2, x, y, segmentWidth, h) {
    const min1 = data1.min;
    const min2 = data2.min;
    const max1 = data1.max;
    const max2 = data2.max;
    const len = min1.length;
    const steps = Math.max(1, segmentWidth);
    const start = Math.max(0, len - steps);

    this.context.beginPath();
    this.context.moveTo(x, y + (-Math.min(min1[start], min2[start]) * 0.5 + 0.5) * h);

    let i = 1;
    while (i < steps) {
      const index = start + i;
      const _y = y + (-Math.min(min1[index], min2[index]) * 0.5 + 0.5) * h;
      const _x = x + i;
      this.context.lineTo(_x, _y);
      i += 1;
    }

    i = steps - 1;
    while (i >= 0) {
      const index = start + i;
      const _y = y + (-Math.max(max1[index], max2[index]) * 0.5 + 0.5) * h;
      const _x = x + i;
      this.context.lineTo(_x, _y);
      i -= 1;
    }

    this.context.closePath();
  }

  async draw(data) {
    const width = this.canvas.width;
    const height = this.canvas.height;

    const advance = data.advance;
    const stripX = width - advance;
    const padding = 3;

    this.context.globalCompositeOperation = "copy";
    this.context.drawImage(this.canvas, -advance + 1, 0);
    this.context.globalCompositeOperation = "source-over";

    this.context.clearRect(stripX + 1, 0, advance, height);
    this.context.fillStyle = this.settings.color;
    this.context.strokeStyle = this.settings.color;
    this.context.lineWidth = this.settings.stroke;

    if (this.settings.mono) {
      this.drawMonoWave(data.left, data.right, stripX, padding, advance, height - 2 * padding);
      this.context.fill();
      this.context.stroke();
    } else {
      this.drawWave(data.left, stripX, padding, advance, height / 2 - padding * 1.5);
      this.context.fill();
      this.context.stroke();
      this.drawWave(data.right, stripX, height / 2 + padding * 0.5, advance, height / 2 - padding * 1.5);
      this.context.fill();
      this.context.stroke();
    }
  }
}