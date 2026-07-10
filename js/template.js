/**
 * Evaluate JS code inside an element.
 * @param {String} script JS code 
 */
Element.prototype.eval = function (script) { return eval(script); }

/**
 * Convert string from kebab case to camel case.
 * @returns camel case version of string
 */
String.prototype.camelize = function () { return this.replace(/-./g, x => x[1].toUpperCase()) }

/**
 * Load file content from a url synchronously
 * @param {String} url 
 * @returns content of file if url exists, empty string otherwise
 */
function loadContentFromUrl(url) {
  const request = new XMLHttpRequest();
  request.open("GET", url, false);
  request.send();

  if (request.status !== 200) return "";
  return request.responseText;
}

/**
 * Collect all style tags of a template element and append it to the head of the document.
 * @param {HTMLTemplateElement} template 
 */
function loadStyleTags(template) {
  const styleTags = template.content.querySelectorAll("style");
  if (styleTags.length === 0) return;

  const tag = document.createElement("style");

  for (const style of styleTags) {
    if (style.hasAttribute('src')) {
      tag.innerHTML += loadContentFromUrl(style.getAttribute('src'));
    } else {
      tag.innerHTML += style.innerHTML;
    }
  }

  document.head.appendChild(tag);
}

/**
 * Collect all script tags of a template element and return all their contents as a string.
 * @param {HTMLTemplateElement} template 
 * @returns 
 */
function collectScriptTags(template) {
  const scriptTags = template.content.querySelectorAll("script");
  let script = "";

  for (const tag of scriptTags) {
    if (tag.hasAttribute('src')) {
      const content = loadContentFromUrl(tag.getAttribute('src'));
      tag.removeAttribute('src');
      tag.innerHTML = content;
      script += content;
    } else {
      script += tag.innerHTML;
    }
  }

  return script;
}

/**
 * Find the div in the template element.
 * @param {HTMLTemplateElement} template 
 * @returns 
 */
function findTemplateContent(template) {
  for (const node of template.content.childNodes) {
    if (node.nodeName !== "STYLE" &&
      node.nodeName !== "#text" &&
      node.nodeName !== "#comment" &&
      node.nodeName !== "SCRIPT") return node;
  }
  return null;
}

/**
 * Collect all elements with an id and add them to the elements object
 * @param {any} elements 
 * @param {HTMLElement} element 
 */
function collectElementsWithId(elements, element) {
  if (element.hasAttribute('id')) {
    const id = element.getAttribute('id');
    element.removeAttribute('id');
    elements[id] = element;
  }

  for (let child of Array.from(element.children)) {
    collectElementsWithId(elements, child);
  }
}

/**
 * Evaluate code inside a string
 * @param {String} content 
 * @returns the string with the evaluated code
 */
function evaluateInlineCode(elements, content) {
  let result;
  while ((result = /{{(.+?)}}/g.exec(content)) !== null) {
    const replacement = `${elements.eval(result[1])}`;
    content = content.substring(0, result.index)
      + replacement.trim()
      + content.substring(result.index + result[0].length);
  }
  return content;
}

/**
 * Execute inlude JS code.
 * @param {HTMLElement} elements
 * @param {HTMLElement} element
 */
function executeInlineCode(elements, element) {
  if (element.nodeType === Node.COMMENT_NODE) {
    // Ignore comments
  } else if (element.nodeType === Node.TEXT_NODE) {
    element.textContent = evaluateInlineCode(elements, element.textContent);
  } else {
    for (const attribute of element.attributes) {
      attribute.value = evaluateInlineCode(elements, attribute.value);
    }
  }

  for (let child of Array.from(element.childNodes)) {
    executeInlineCode(elements, child);
  }
}

/**
 * Create an instance of a template element.
 * @param {string} id identifier of the template
 * @param {any} attr object containing attributes to give the element 
 * @returns 
 */
function createInstance(id, attr = {}) {
  let template = document.getElementById(id);
  if (template.alreadyLoaded === undefined) {
    template.alreadyLoaded = false;
  }

  if (!template.alreadyLoaded) {
    if (template.hasAttribute('src')) {
      template.innerHTML = loadContentFromUrl(template.getAttribute('src'));
      template.removeAttribute('src');
    }

    loadStyleTags(template);
    template.scriptText = collectScriptTags(template);
    template.contentElement = findTemplateContent(template);

    template.alreadyLoaded = true;
  }

  let instance = template.contentElement.cloneNode(true);

  for (let [name, value] of Object.entries(attr)) {
    instance[name] = value;
  }

  // Instantiate all templates inside the template
  let templates = document.getElementsByTagName('template');
  for (let template of templates) {
    // Find all the instances of the template.
    let name = template.id;
    let templateInstances = instance.getElementsByTagName(name);
    while (templateInstances.length > 0) {
      let templateInstance = templateInstances[0];
      executeInlineCode(instance, templateInstance);
      // Construct an object containing all the attributes from 
      // the element. Need to convert from 'kebab case' to 'camel case'
      let attr = templateInstance.attributes;
      let id = templateInstance.id; // save its id, which we'll add back later
      let obj = {};
      for (let i = 0; i < attr.length; i++)
        obj[attr[i].name.camelize()] = attr[i].value;
      // Finally create an instance at the location of the tag
      const element = createInstance(name, obj);
      element.classList.add(...templateInstance.classList);
      element.id = id; // Set ID again, which would have been removed in createInstance
      templateInstance.parentNode.insertBefore(element, templateInstance);
      templateInstance.parentNode.removeChild(templateInstance);
    }
  }

  instance._destructors = [];
  instance.ondestroy = callback => instance._destructors.push(callback);
  instance.destroy = () => {
    instance.logger.debug("Destroy");
    for (const callback of instance._destructors) callback();
    instance.clear();
    instance.remove();
  }
  instance.elements = {};
  collectElementsWithId(instance.elements, instance);

  instance.logger = new Logger(id);
  instance.eval(template.scriptText);

  instance.constructor(attr);

  executeInlineCode(instance, instance);

  return instance;
}

/**
 * Load all template instances in the DOM.
 */
function loadTemplateInstances() {
  let templates = document.getElementsByTagName('template');
  for (let template of templates) {
    // Find all the instances of the template.
    let name = template.id;
    let instances = document.getElementsByTagName(name);
    while (instances.length > 0) {
      let instance = instances[0];
      // Construct an object containing all the attributes from 
      // the element. Need to convert from 'kebab case' to 'camel case'
      let attr = instance.attributes;
      let id = instance.id; // save its id, which we'll add back later
      let obj = {};
      for (let i = 0; i < attr.length; i++)
        obj[attr[i].name.camelize()] = attr[i].value;
      // Finally create an instance at the location of the tag
      const element = createInstance(name, obj)
      element.classList.add(...instance.classList);
      element.id = id; // Set ID again, which would have been removed in createInstance
      instance.parentNode.insertBefore(element, instance);
      instance.parentNode.removeChild(instance)
    }
  }
}

Node.prototype._clearNested = function () {
  while (this.childNodes.length !== 0) {
    if (this.childNodes[0].destroy) this.childNodes[0].destroy();
    else {
      try {
        this.childNodes[0]._clearNested();
        this.childNodes[0].remove();
      } catch (e) {

      }
    }
  }
}

Node.prototype.clear = function () {
  while (this.childNodes.length !== 0) {
    if (this.childNodes[0].destroy) this.childNodes[0].destroy();
    else {
      try {
        this.childNodes[0]._clearNested();
        this.childNodes[0].remove();
      } catch (e) {

      }
    }
  }
}