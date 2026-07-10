
class Component {
  static identifier = 0;

  constructor(processor, position, settings, nodeType = null, withFilters = true) {
    // Global component settings
    this.settings = {
      lowpass: settings.lowpass || false,
      highpass: settings.highpass || false,
      lowpassFrequency: settings.lowpassFrequency || 3000,
      highpassFrequency: settings.highpassFrequency || 200,
      color: settings.color || "#ffffff",
      background: settings.background || "#000000"
    };
    // Create analyze element at the position
    this.element = processor.analyzer.createAnalyzeElement(position);
    this.element.style.backgroundColor = this.settings.background;
    this.element.component = this;
    this.processor = processor;
    this.id = Component.identifier++;
    this.element.setAttribute('data-id', this.id);
    this.freeze = false;
    // Create the canvas to draw on
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    this.element.appendChild(this.canvas)
    this.canvas.width = position[2];
    this.canvas.height = position[3];
    // When the element is resized, the canvas should also resize
    this.element.resizeCallback = (w, h) => {
      this.canvas.width = w;
      this.canvas.height = h;
      if (this.node) {
        this.node.port.postMessage({
          width: Math.ceil(this.canvas.width)
        });
      }
    };
    // Add the node type to the processor
    processor.add(this, nodeType).then(node => {
      if (!node) return;
      this.node = node; // Store node

      if (withFilters) {
        const addFilter = (type, freq, ...nodes) => {
          const filter = processor.context.createBiquadFilter();
          filter.type = type;
          filter.frequency.value = freq;
          filter.Q.value = -2;
          for (const node of nodes) node.connect(filter);
          return filter;
        };
        const addGain = (lvl, ...nodes) => {
          const gain = processor.context.createGain();
          gain.gain.value = lvl;
          for (const node of nodes) node.connect(gain);
          return gain;
        };
        // Add 24dB/oct filter depending on settings, single
        // biquad filter is 12dB/oct, so we're doubling.
        this.highpass1 = addFilter('highpass', this.settings.highpassFrequency, processor);
        this.highpass2 = addFilter('highpass', this.settings.highpassFrequency, this.highpass1);
        this.highpassGain = addGain(this.settings.highpass ? 1 : 0, this.highpass2);
        this.highpassBypass = addGain(this.settings.highpass ? 0 : 1, processor);
        this.lowpass1 = addFilter('lowpass', this.settings.lowpassFrequency, this.highpassGain, this.highpassBypass);
        this.lowpass2 = addFilter('lowpass', this.settings.lowpassFrequency, this.lowpass1);
        this.lowpassGain = addGain(this.settings.lowpass ? 1 : 0, this.lowpass2);
        this.lowpassBypass = addGain(this.settings.lowpass ? 0 : 1, this.highpassGain, this.highpassBypass);
        this.lowpassGain.connect(this.node);
        this.lowpassBypass.connect(this.node);
      } else {
        processor.connect(this.node);
      }
      
      // When a message is received, use it to draw
      this.node.port.onmessage = event => {
        if (!this.freeze) {
          processor.analyzer.requestAnimationFrame(() => this.draw(event.data));
        }
      };
      
      this.updateSettings();
    });
  }

  position() {
    const rect = this.element.getBoundingClientRect();
    return [rect.x, rect.y, rect.width, rect.height];
  }

  async updateSettings() {
    if (this.node.port) {
      this.node.port.postMessage(this.settings);
    }
    this.highpass1.frequency.value = this.settings.highpassFrequency;
    this.highpass2.frequency.value = this.settings.highpassFrequency;
    this.highpassGain.gain.value = this.settings.highpass ? 1 : 0;
    this.highpassBypass.gain.value = this.settings.highpass ? 0 : 1;
    this.lowpass1.frequency.value = this.settings.lowpassFrequency;
    this.lowpass2.frequency.value = this.settings.lowpassFrequency;
    this.lowpassGain.gain.value = this.settings.lowpass ? 1 : 0;
    this.lowpassBypass.gain.value = this.settings.lowpass ? 0 : 1;
    this.element.style.backgroundColor = this.settings.background;
  }
}
