class Processor {
    /**
     * Construct a processor using the device id.
     * @param deviceid device identifier
     */
    constructor(deviceid) {
        // User Media constraints
        const constraints = {
            audio: {
                deviceId: deviceid ? {
                    exact: deviceid
                } : undefined,
                // Disable any unwanted processing:
                echoCancellation: false,
                noiseSuppression: false
            },
        };

        this.selected = -1;
        this.components = [];
        this.context = new AudioContext();
        this.inSetup = new Promise((resolve, reject) => {
            const open = async device => {
                this.device = device; // Store the input device
                // Create the input stream using the device
                this.stream = this.context.createMediaStreamSource(this.device);
                // Add all processors
                await this.context.audioWorklet.addModule("./js/processors/oscilloscope.js");
                await this.context.audioWorklet.addModule("./js/processors/vectorscope.js");
                // Add analyzer window
                this.analyzer = window.open('./popup.html', '_blank', 'popup=true,width=501,height=501');
                this.analyzer.onload = () => {
                    this.analyzer.onunload = () => {
                        document.getElementById('init-device').style.display = null;
                        document.getElementById('analyzer-settings').style.display = 'none';
                        localStorage['analyzerCache'] = JSON.stringify(getAnalyzersAsJson());
                        this.clear();
                        this.analyzer.close();
                        this.context.close();
                        this.stream.disconnect();
                        this.device.getTracks().forEach(function(track) {
                            track.stop();
                        });
                        processor = null;
                    }

                    this.analyzer.onAnalyzerSelected = (id) => {
                        this.selected = id;
                        if (id == -1) {
                            let el = document.getElementById('selected-component');
                            while (el.firstChild) el.removeChild(el.firstChild);
                            el.innerText = 'None Selected';
                        } else {
                            openComponentSettings(this.get(id));
                        }
                    }

                    resolve();
                }
            };
            if (deviceid == "desktop-audio") {
                navigator.mediaDevices.getDisplayMedia({
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false
                    },
                    video: true
                }).then(open).catch(error => {
                    console.log(error);
                    reject(error);
                })
            } else {
                // This retrieves the selected input audio device.
                navigator.mediaDevices.getUserMedia(constraints).then(open).catch(error => {
                    console.log(error);
                    reject(error)
                });
            }
        });
    }

    /**
     * Remove all the components from this processor.
     */
    clear() {
        removeSelectedOptions();
        if (this.components.length == 0) return;
        this.components.forEach(el => {
            if (el.delete) el.delete();
            if (!el.node) {
                el = null;
                return;
            }
            el.node.port.postMessage({
                release: true
            });
            el.node.port.onmessage = null;
            el.node.port.close();
            el = null;
        })
        this.components = [];
        this.analyzer.clearComponents();
    }

    /**
     * Connect the input of the processor to a node.
     * @param node node to receive input from processor
     */
    async connect(node) {
        await this.inSetup;
        this.stream.connect(node);
    }

    /**
     * Add a component to the processor.
     * @param name string identifier of the node
     * @param component component object
     * @return the audio worklet node that contains the component
     */
    async add(component, name = null) {
        await this.inSetup;
        this.components.push(component);
        this.analyzer.addComponent(component);
        if (name) {
            let node = new AudioWorkletNode(this.context, name);
            return node;
        } else return null;
    }

    /**
     * Get a component with a certain id.
     * @param id component id
     * @returns 
     */
    get(id) {
        for (const c of this.components)
            if (c.id == id) return c;
        return null;
    }

    /**
     * Remove a component from the processor.
     * @param component component to remove 
     */
    async remove(id) {
        if (id == this.selected) {
            removeSelectedOptions();
        }
        let component = this.get(id);
        if (component.node) {
            component.node.port.postMessage({
                release: true
            });
            component.node.port.onmessage = null;
            component.node.port.close();
        }
        if (component.delete) component.delete();
        const index = this.components.indexOf(component);
        if (index > -1) { // only splice array when item is found
            this.components.splice(index, 1); // 2nd parameter means remove one item only
        }
        this.analyzer.removeComponent(component);
        component = null;
    }
}

class Component {
    static identifier = 0;

    constructor(processor, position, settings, nodeType = null) {
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
        super(processor, position, settings);
        delete this.settings.lowpass;
        delete this.settings.highpass;
        delete this.settings.lowpassFrequency;
        delete this.settings.highpassFrequency;
        delete this.settings.color;
        this.context.imageSmoothingEnabled = false;
        this.settings.window = settings.window || 3;
        this.settings.log = settings.log || false;
        this.settings.range = settings.range || -61;
        this.settings.bands = settings.bands || 2048;
        this.settings.colors = settings.colors || new Array(
            [0, 0, 0, 0], [60, 60, 179, 120], [239, 15, 0, 200], [255, 255, 40, 255], [255, 255, 255, 255]
        );
        this.analyzer = processor.context.createAnalyser();
        this.analyzer.fftSize = this.settings.bands;
        this.analyzer.smoothingTimeConstant = 0;
        this.bands = this.analyzer.frequencyBinCount;
        this.amps = [
            new Float32Array(this.analyzer.frequencyBinCount),
            new Float32Array(this.analyzer.frequencyBinCount),
        ];
        this.which = 0;
        this.weights = [
            [],
            []
        ];
        this.mults = [
            [],
            []
        ];
        this.colorLookup = [];
        for (let i = 0; i < 256; ++i) {
            this.colorLookup[i] = intensityToColor(i / 255, this.settings.colors);
        }

        this.element.resizeCallback = (w, h) => {
            this.canvas.width = w;
            this.canvas.height = h;
            if (this.node) {
                this.node.port.postMessage({
                    width: Math.ceil(this.canvas.width)
                });
            }
        };

        this.destroyed = false;
        processor.connect(this.analyzer);
        this.processor.analyzer.requestAnimationFrame(() => this.draw());
    }

    delete() {
        this.destroyed = true;
    }

    async updateSettings() {
        this.element.style.backgroundColor = this.settings.background;
        if (this.analyzer.fftSize != this.settings.bands) {
            this.analyzer.fftSize = this.settings.bands;
            this.bands = this.analyzer.frequencyBinCount;
            this.amps = [
                new Float32Array(this.analyzer.frequencyBinCount),
                new Float32Array(this.analyzer.frequencyBinCount),
            ];
        }
        this.colorLookup = [];
        for (let i = 0; i < 256; ++i) {
            this.colorLookup[i] = intensityToColor(i / 255, this.settings.colors);
        }
    }

    async draw() {
        if (!this.destroyed) {
            this.processor.analyzer.requestAnimationFrame(() => this.draw());
        }
        if (this.freeze) return;

        const shift = Math.floor(Math.max(1, this.settings.window));
        this.context.globalCompositeOperation = "copy";
        this.context.drawImage(this.canvas, -shift, 0);
        this.context.globalCompositeOperation = "source-over";
        this.which = 1 - this.which;
        this.analyzer.getFloatFrequencyData(this.amps[this.which]);

        const me = this.which;
        const other = 1 - this.which;
        let j = 0;
        let i = 0;
        const len = this.canvas.height;
        const bins = this.bands;
        while (i < len) {
            const aindex = (bins - 1) * i / len;
            const index = this.settings.log ? aindex < 2.5 ? 0 : toLog(aindex, 2.5, bins) : aindex;
            const i1 = Math.floor(index);
            const weight = Math.log2(24000 * (index / bins)) * 3;
            const amp = this.amps[me][i1] * (1 - (index - i1)) +
                this.amps[me][i1 + 1] * (index - i1) - 12 + weight;
            const weighted = Math.min(1, Math.max(0, (amp - this.settings.range) / (0 - this.settings.range)));
            this.weights[me][i] = weighted;
            i++;
        }
        this.cacheImage = new ImageData(shift, this.canvas.height);

        if (this.settings.log && this.settings.enhanced) {
            const smoothing = 20;
            let prev = 0;
            let down = false;

            i = 0;
            while (i < len) {
                if (this.mults[me][i]) {
                    this.mults[me][i] = this.mults[me][i] * 0;
                } else this.mults[me][i] = 0;
                i++;
            }

            i = 0;
            while (i < len) {
                const w = this.weights[me][i];
                if (down) {
                    if (w >= prev) {
                        down = false;
                    }
                } else {
                    if (w <= prev) {
                        down = true;
                        j = -smoothing;
                        while (j < smoothing) {
                            const index = i + j;
                            const ratio = 1 * (1 - Math.abs(j / smoothing));
                            j++;
                            if (index < 0) continue;
                            if (index >= len) break;
                            this.mults[me][index] += ratio * ratio * ratio;
                        }
                    }
                    prev = w;
                }
                i++;
            }
        }

        i = 0;
        while (i < len) {
            const y = this.canvas.height - i;
            let weighted1 = this.weights[other][i];
            let weighted2 = this.weights[me][i];
            if (this.settings.log && this.settings.enhanced) {
                weighted1 = this.weights[me][i] * Math.min(1, this.mults[me][i]);
                weighted2 = this.weights[me][i] * Math.min(1, this.mults[me][i]);
            }

            j = 0;
            while (j < shift) {
                const index = (shift - j - 1) * 4 + y * 4 * shift;
                const ratio = j / shift;
                const weighted = Math.min(1, Math.max(0, weighted1 * ratio + weighted2 * (1 - ratio)));
                const color = this.colorLookup[Math.floor(weighted * 255)];
                this.cacheImage.data[index + 0] = color[0];
                this.cacheImage.data[index + 1] = color[1];
                this.cacheImage.data[index + 2] = color[2];
                this.cacheImage.data[index + 3] = color[3];
                j++;
            }
            i++;
        }

        this.context.putImageData(this.cacheImage, this.canvas.width - shift, 0);
    }
}