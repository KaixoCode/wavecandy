window.AudioContext = window.AudioContext || window.webkitAudioContext;
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia;

window.onload = () => {
  // This requests audio permission on first visit.
  navigator.mediaDevices.getUserMedia({
    audio: true
  }).then(() => {
    // Fill device select with all input audio devices.
    navigator.mediaDevices.enumerateDevices().then(d => {
      const devices = document.getElementById('audio-devices');
      d.forEach(el => {
        if (el.kind != 'audioinput') return;
        const option = document.createElement('option');
        option.value = el.deviceId;
        option.innerText = el.label;
        devices.appendChild(option);
      })
    })
  });
}

/**
 * Load a preset from a url.
 * @param url url
 */
function loadPresetUrl(url) {
  fetch(url).then(r => r.json()).then(j => loadPreset(j));
}

/**
 * Load preset from file selected in the file input.
 */
function loadPresetFile() {
  const file = document.getElementById('load-preset-file');
  const url = URL.createObjectURL(file.files[0]);
  loadPresetUrl(url);
}

/**
 * Load a preset from json.
 * @param json json 
 */
async function loadPreset(json) {
  await processor.inSetup;
  // Remove all components from the processor
  processor.clear();
  // Go through all the components in the json and add them to the processor
  json.components.forEach(c => {
    add(c.type, c.position, c.settings);
  })
}

/**
 * Save a file.
 * @param fileName name of file
 * @param url url of file
 */
function saveFile(fileName, urlFile) {
  let a = document.createElement('a');
  a.style = 'display: none';
  document.body.appendChild(a);
  a.href = urlFile;
  a.download = fileName;
  a.click();
  a.remove();
}

/**
 * Convert current state to json. 
 */
function getAnalyzersAsJson() {
  let json = {
    components: []
  };

  for (const c of processor.components) {
    json.components.push({
      type: c.constructor.name,
      position: c.position(),
      settings: c.settings
    })
  }
  return json;
}

/**
 * Save current state as file.
 */
function savePreset() {
  const json = getAnalyzersAsJson();
  const text = JSON.stringify(json);
  const blob = new Blob([text], {
    type: 'application/json'
  })
  const url = URL.createObjectURL(blob);
  saveFile('analyzer.json', url);
  URL.revokeObjectURL(url);
}

/**
 * Remove the options of the selected component from the div.
 */
function removeSelectedOptions() {
  processor.selected = -1;
  let el = document.getElementById('selected-component');
  while (el.firstChild) el.removeChild(el.firstChild);
  el.innerText = 'None Selected';
}

/**
 * Remove all components from the processor.
 */
function clearAll() {
  processor.clear();
  document.getElementById('load-preset-file').value = null;
}

/**
 * Add a component.
 * @param type component type name
 * @param position position in window
 * @param settings component specific settings
 */
function add(type, position = [0, 0, 500, 500], settings = {}) {
  return new (eval(type))(processor, position, settings);
}

/**
 * Remove a component.
 * @param component component to remove
 */
function remove(component) {
  processor.remove(component);
}

// Globally accessible processor instance
let processor = null;

/**
 * Initialize the processor using the selected device.
 */
const init = async () => {
  const devices = document.getElementById('audio-devices');
  const deviceId = devices.options[devices.selectedIndex].value;

  processor = new Processor(deviceId);

  document.getElementById('init-device').style.display = 'none';
  document.getElementById('analyzer-settings').style.display = null;

  // If cache present, load from cache.
  if (localStorage['analyzerCache']) {
    loadPreset(JSON.parse(localStorage['analyzerCache']));
  } else { // Otherwise default setup
    await processor.inSetup;
    add("Oscilloscope", [120, 0, 380, 120], {
      mono: true
    });
    add("Spectrum", [0, 120, 500, 380], {
      window: 2
    });
    add("Vectorscope", [0, 0, 120, 120], {
      thickness: 1
    });
  }
}

window.onbeforeunload = () => {
  // Store current settings in cache when window closes.
  if (processor.components.length > 0) {
    localStorage['analyzerCache'] = JSON.stringify(getAnalyzersAsJson());
  }
  processor.analyzer.close();
}

/**
 * Open the component settings in the 'selected-component' div.
 * @param component component
 */
async function openComponentSettings(component) {
  // Remove existing stuff
  let el = document.getElementById('selected-component');
  while (el.firstChild) el.removeChild(el.firstChild);

  // Add all settings
  for (const key in component.settings) {
    const inst = await createInstance('component-param', {
      component: component,
      name: key,
      value: component.settings[key]
    });
    el.appendChild(inst);
  }

  // Add delete button
  const del = document.createElement('button');
  del.classList.add('delete-button');
  del.innerText = 'Delete';
  del.addEventListener('click', () => {
    processor.remove(component.id);
    while (el.firstChild) el.removeChild(el.firstChild);
    el.innerText = 'None Selected';
  })
  el.appendChild(del);
}