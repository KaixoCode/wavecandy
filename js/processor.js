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
        await this.context.audioWorklet.addModule("./js/processors/spectrum.js");
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
            this.device.getTracks().forEach(function (track) {
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
