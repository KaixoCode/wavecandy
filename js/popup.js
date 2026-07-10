window.history.pushState(null, "", "/");
window.createAnalyzeElement = createAnalyzeElement;

window.onAnalyzerSelected = (id) => {}

/**
 * Remove all the components from this popup window.
 */
window.clearComponents = () => {
    const c = document.getElementById('components');
    while (c.firstChild) c.removeChild(c.firstChild);
}

/**
 * Add a component to this popup window.
 * @param component component
 */
window.addComponent = (component) => {
    document.getElementById('components').appendChild(component.element);
}

/**
 * Remove a component from this popup window.
 * @param component component
 */
window.removeComponent = (component) => {
    document.getElementById('components').removeChild(component.element);
}

/**
 * Helper for creating the basis of an analyze component.
 * @param position position
 */
function createAnalyzeElement(position) {
    const pos = position || [0, 0, 500, 500];
    const element = document.createElement('div');
    element.classList.add('analyze-div');

    // All resize edges are separate divs
    const resizer = (type) => {
        const e = document.createElement('div');
        e.classList.add(type);
        return e;
    }
    element.appendChild(resizer('left'));
    element.appendChild(resizer('right'));
    element.appendChild(resizer('top'));
    element.appendChild(resizer('bottom'));
    element.appendChild(resizer('bottom-right'));
    element.appendChild(resizer('bottom-left'));
    element.appendChild(resizer('top-right'));
    element.appendChild(resizer('top-left'));
    element.appendChild(resizer('overlay'));

    // Set initial element size
    element.style.left = pos[0] + "px";
    element.style.top = pos[1] + "px";
    element.style.width = pos[2] + "px";
    element.style.height = pos[3] + "px";

    // Mouse down event determines whether start dragging or resizing.
    element.addEventListener('mousedown', event => {
        if (event.button == 1) {
            if (element.component) {
                element.component.freeze = !element.component.freeze;
            }
            return;
        }
        deselectAll();
        element.classList.add('selected');
        element.parentNode.appendChild(element);
        // Send new selected analyzer
        window.onAnalyzerSelected(element.getAttribute("data-id"));
        // Determine activity.
        const rect = element.getBoundingClientRect();
        const padding = 20; // If within 20px padding from edge: dragging, else resizing
        if (event.clientX > rect.left + padding && event.clientX < rect.right - padding &&
            event.clientY > rect.top + padding && event.clientY < rect.bottom - padding) {
            dragStart = {
                x: event.clientX - rect.x,
                y: event.clientY - rect.y
            }
            draggingElement = element;
        } else {
            resizingElement = element;
            resizeX = 0;
            resizeY = 0;
            if (event.clientX < rect.left + padding) resizeX = -1;
            if (event.clientX > rect.right - padding) resizeX = 1;
            if (event.clientY < rect.top + padding) resizeY = -1;
            if (event.clientY > rect.bottom - padding) resizeY = 1;
        }
        event.preventDefault();
        event.stopPropagation();
    })

    // Add a resize observer, so the component can 
    // resize its canvas when a resize event occurs.
    element.resizeCallback = (width, height) => {};
    const observer = new ResizeObserver(event => {
        const w = event[0].contentRect.width;
        const h = event[0].contentRect.height;
        const sw = snap(w, window.grid);
        const sh = snap(h, window.grid);
        element.resizeCallback(sw, sh);
        element.style.width = sw + "px";
        element.style.height = sh + "px";
    })
    observer.observe(element);

    return element;
}

/**
 * Snap a value to a multiple.
 * @param val value
 * @param mult multiple to snap to
 */
function snap(val, mult) {
    return Math.ceil(val /= mult) * mult;
}

window.grid = 5; // Grid size to snap to
let dragStart = {
    x: 0,
    y: 0
};

// Resize direction: 0 = none, -1 = left/top, 1 = right/bottom
let resizeX = 0;
let resizeY = 0;

const minWidth = 100;
const minHeight = 100;
const maxWidth = 1100;
const maxHeight = 790;

// Mouse move to do drag and resize.
let draggingElement = null;
let resizingElement = null;
window.addEventListener('mousemove', event => {
    const shift = event.shiftKey;
    if (draggingElement) {
        draggingElement.style.left = snap(event.clientX - dragStart.x, window.grid) + "px";
        draggingElement.style.top = snap(event.clientY - dragStart.y, window.grid) + "px";
    }
    if (resizingElement) {
        const rect = resizingElement.getBoundingClientRect();
        const origX = parseInt(resizingElement.style.left);
        const nextX = snap(event.clientX, window.grid);
        const goalX = snap(parseInt(resizingElement.style.width) + origX - nextX, window.grid);
        const origY = parseInt(resizingElement.style.top);
        const nextY = snap(event.clientY, window.grid);
        const goalY = snap(parseInt(resizingElement.style.height) + origY - nextY, window.grid);
        if (shift) { // Keep square
            let width = 0;
            let height = 0;
            let x = 0;
            let y = 0;
            // Calc prefered new dimensions
            if (resizeX == -1) {
                width = Math.max(minWidth, Math.min(maxWidth, goalX));
                x = nextX + goalX;
            } else {
                width = Math.max(minWidth, Math.min(maxWidth, snap(event.clientX - rect.left, window.grid)));
                x = parseInt(resizingElement.style.left);
            }
            if (resizeY == -1) {
                height = Math.max(minHeight, Math.min(maxHeight, goalY));
                y = nextY + goalY;
            } else {
                height = Math.max(minHeight, Math.min(maxHeight, snap(event.clientY - rect.top, window.grid)));
                y = parseInt(resizingElement.style.top);
            }

            // make square
            const size = Math.min(maxHeight, Math.min(maxWidth, Math.max(width, height)));
            resizingElement.style.height = size + "px";
            resizingElement.style.width = size + "px";

            // Adjust coords to account for snapping and constraining
            if (resizeX == -1) x -= size;
            if (resizeY == -1) y -= size;

            resizingElement.style.left = x + "px";
            resizingElement.style.top = y + "px";

        } else { // Not square
            if (resizeX == -1) {
                const width = Math.max(minWidth, Math.min(maxWidth, goalX));
                const short = width - goalX;
                resizingElement.style.left = (nextX - short) + "px";
                resizingElement.style.width = width + "px";
            } else if (resizeX == 1) {
                const width = Math.max(minWidth, Math.min(maxWidth, snap(event.clientX - rect.left, window.grid)));
                resizingElement.style.width = width + "px";
            }
            if (resizeY == -1) {
                const height = Math.max(minHeight, Math.min(maxHeight, goalY));
                const short = height - goalY;
                resizingElement.style.top = (nextY - short) + "px";
                resizingElement.style.height = height + "px";
            } else if (resizeY == 1) {
                const height = Math.max(minHeight, Math.min(maxHeight, snap(event.clientY - rect.top, window.grid)));
                resizingElement.style.height = height + "px";
            }
        }
    }
})

function deselectAll() {
    const selectedElements = document.getElementsByClassName('selected');
    for (const i of selectedElements) {
        i.classList.remove('selected');
    }
}

window.addEventListener('mouseup', event => {
    draggingElement = null;
    resizingElement = null;
});

window.addEventListener('mousedown', event => {
    deselectAll();
    window.onAnalyzerSelected(-1);
});

window.addEventListener('keydown', event => {
    const add = event.ctrlKey ? window.grid * 5 : window.grid;
    const resize = event.shiftKey;
    if (event.key === "Escape") {
        deselectAll();
        window.onAnalyzerSelected(-1);
    } else if (event.key == "Delete") {
        const selectedElements = document.getElementsByClassName('selected');
        for (const i of selectedElements) {
            i.component.processor.remove(i.component.id);
        }
    } else if (event.key == "ArrowLeft") {
        const selectedElements = document.getElementsByClassName('selected');
        for (const i of selectedElements) {
            if (resize) {
                i.style.width = Math.max(minWidth, Math.min(maxWidth, parseInt(i.style.width) - add)) + "px";
            } else {
                i.style.left = parseInt(i.style.left) - add + "px";
            }
        }
    } else if (event.key == "ArrowRight") {
        const selectedElements = document.getElementsByClassName('selected');
        for (const i of selectedElements) {
            if (resize) {
                i.style.width = Math.max(minWidth, Math.min(maxWidth, parseInt(i.style.width) + add)) + "px";
            } else {
                i.style.left = parseInt(i.style.left) + add + "px";
            }
        }
    } else if (event.key == "ArrowUp") {
        const selectedElements = document.getElementsByClassName('selected');
        for (const i of selectedElements) {
            if (resize) {
                i.style.height = Math.max(minHeight, Math.min(maxHeight, parseInt(i.style.height) - add)) + "px";
            } else {
                i.style.top = parseInt(i.style.top) - add + "px";
            }
        }
    } else if (event.key == "ArrowDown") {
        const selectedElements = document.getElementsByClassName('selected');
        for (const i of selectedElements) {
            if (resize) {
                i.style.height = Math.max(minHeight, Math.min(maxHeight, parseInt(i.style.height) + add)) + "px";
            } else {
                i.style.top = parseInt(i.style.top) + add + "px";
            }
        }
    }
});