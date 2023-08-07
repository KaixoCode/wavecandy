/**
 * Evaluate JS code inside an element.
 * @param {String} script JS code 
 */
Element.prototype.eval = function(script) { eval(script); }

/**
 * Find an element inside of another element using a class name.
 * @param {String} id class name 
 * @returns 
 */
Element.prototype.find = function(id) {
    return this.getElementsByClassName(id)[0];
}

/**
 * Convert string from kebab case to camel case.
 * @returns camel case version of string
 */
String.prototype.camelize = function() { return this.replace(/-./g, x => x[1].toUpperCase()) }

/**
 * Create an instance of a template.
 * @param {String} id Id of the template tag
 * @param {Object} attr Object containing attributes 
 * @returns instance of the template
 */
async function createInstance(id, attr = {}) {
    let template = document.getElementById(id);
    // If the template is located in another file
    if (template.getAttribute('src') != undefined) {
        // If we're already loading the content, wait
        if (template.loadContent != undefined)
            await template.loadContent;
        // Otherwise fetch the source from the url and put 
        // it in the template tag so we don't have to load it again.
        else await fetch(template.getAttribute('src'))
            .then(response => response.text()).then(source => {
                template.innerHTML = source;
                template.removeAttribute('src');
            });
    }
    // Find the script and content tags
    let script = '';
    let element = null;
    for (let i of template.content.children) {
        if (i.tagName == 'SCRIPT') {
            // If the script is located in another file
            if (i.getAttribute('src') != undefined) {
                // Fetch the script from the url
                script = await fetch(i.getAttribute('src'))
                    .then(response => response.text());
                // Put the script in the tag to prevent having to
                // load it again.
                i.innerHTML = script;
                i.removeAttribute('src');
            } else script = i.innerHTML;
        }
        // If a style or link tag is found, it's likely CSS, so add to head
        else if (i.tagName == 'STYLE' || i.tagName == 'LINK') {
            document.head.appendChild(i);
        }
        // Otherwise it's the template itself
        else element = i;
    }
    // Clone the element and copy over all the attributes as members
    let instance = element.cloneNode(true);
    for (let [name, value] of Object.entries(attr))
        instance[name] = value;
    // Evaluate the script in the instance
    instance.eval(script);
    return instance;
}

/**
 * Instantiate any existing templates on load.
 */
async function evalTemplates() {
    // Find all template tags.
    let templates = document.getElementsByTagName('template');
    for (let template of templates) {
        // If content is external, fetch the source from the url.
        if (template.getAttribute('src') != undefined) {
            // Keep the Promise so we can await that later if necessary
            template.loadContent = fetch(template.getAttribute('src'))
                .then(response => response.text())
                .then(source => {
                    // Store source inside tag to prevent 
                    // having to load it multiple times
                    template.innerHTML = source;
                    template.removeAttribute('src');
                });
        }
        // Find all the instances of the template.
        let name = template.id;
        let instances = document.getElementsByTagName(name);
        while (instances.length > 0) {
            let instance = instances[0];
            // Construct an object containing all the attributes from 
            // the element. Need to convert from 'kebab case' to 'camel case'
            let attr = instance.attributes;
            let obj = {};
            for (let i = 0; i < attr.length; i++)
                obj[attr[i].name.camelize()] = attr[i].value;
            // Finally create an instance at the location of the tag
            await createInstance(name, obj).then(elem => {
                instance.parentNode.insertBefore(elem, instance);
                instance.parentNode.removeChild(instance)
            });
        }
    }
}
evalTemplates();