// infoBar.js
// Responsive, dynamic info bar for bag preview

document.addEventListener('DOMContentLoaded', function () {
    insertInfoBar();
    setupInfoBarPopulation();
});

function insertInfoBar() {
    const previewContainer = document.getElementById('preview-window');
    if (!previewContainer) {
        console.error('Preview window not found');
        return;
    }
    if (document.getElementById('info-bar-container')) return;

    // Responsive design
    const ROWS = 5;
    const rowH = 22;
    const OUTER_MARGIN = 10;
    const borderW = 2;
    const logoColW = 80;
    const labelColW = 80;
    const dataColW = 240;
    const colorColW = 240;
    const rightColW = 45 * 4; // 4 right columns
    const colorSwatchCount = 10;
    const colorCellY = 20 + rowH * 2;
    const colorCellH = rowH * 2;

    // Calculate total width and height
    const totalW = logoColW + labelColW + dataColW + colorColW + rightColW;
    const totalH = OUTER_MARGIN * 2 + rowH * ROWS;
    const svgH = totalH + 30; // extra for border and bottom

    const yRow = Array.from({ length: ROWS }, (_, i) => OUTER_MARGIN + rowH * i);

    // Responsive outer <div>
    const infoBarDiv = document.createElement('div');
    infoBarDiv.id = 'info-bar-container';
    infoBarDiv.style.marginTop = '10px';
    infoBarDiv.style.position = 'relative';
    infoBarDiv.style.width = '100%';
    infoBarDiv.innerHTML = `
        <div style="width: 100%; max-width: ${totalW + OUTER_MARGIN * 2}px; margin: 0 auto;">
            <svg id="infoBarSVG" width="100%" height="${svgH}" viewBox="0 0 ${totalW + OUTER_MARGIN * 2} ${svgH}" preserveAspectRatio="xMinYMin meet">
                <!-- Outer border -->
                <rect x="${OUTER_MARGIN / 2}" y="${OUTER_MARGIN / 2}" width="${totalW + OUTER_MARGIN}" height="${svgH - OUTER_MARGIN}" rx="8" ry="8" fill="#fff" stroke="#bbb" stroke-width="${borderW}" />
                <!-- Table background -->
                <rect x="${OUTER_MARGIN}" y="${OUTER_MARGIN}" width="${totalW}" height="${rowH * ROWS}" rx="3" ry="3" fill="#fff" stroke="#aaa" stroke-width="1"/>
                <!-- Logo column -->
                <rect x="${OUTER_MARGIN + 0}" y="${OUTER_MARGIN}" width="${logoColW}" height="${rowH * ROWS}" fill="#f0f8ff" stroke="#ccc" stroke-width="1"/>
                <image id="infoBar-logo" x="${OUTER_MARGIN + 4}" y="${OUTER_MARGIN + 6}" width="${logoColW - 8}" height="${logoColW - 8}" href="IMG/Star Logo.jpg" />
                <!-- Label column -->
                ${yRow.map((y, i) =>
                    `<rect x="${OUTER_MARGIN + logoColW}" y="${y}" width="${labelColW}" height="${rowH}" fill="#f5f5f5" stroke="#ccc" stroke-width="1"/>`
                ).join('')}
                <!-- Data column -->
                ${yRow.map((y, i) =>
                    `<rect x="${OUTER_MARGIN + logoColW + labelColW}" y="${y}" width="${dataColW}" height="${rowH}" fill="#fff" stroke="#ccc" stroke-width="1"/>`
                ).join('')}
                <!-- Labels -->
                <text x="${OUTER_MARGIN + logoColW + labelColW/2}" y="${OUTER_MARGIN + rowH/2 + 5}" font-family="Arial" font-size="11" text-anchor="middle" font-weight="bold" fill="#333">Date</text>
                <text x="${OUTER_MARGIN + logoColW + labelColW/2}" y="${OUTER_MARGIN + rowH*1 + rowH/2 + 5}" font-family="Arial" font-size="11" text-anchor="middle" font-weight="bold" fill="#333">Customer</text>
                <text x="${OUTER_MARGIN + logoColW + labelColW/2}" y="${OUTER_MARGIN + rowH*2 + rowH/2 + 5}" font-family="Arial" font-size="11" text-anchor="middle" font-weight="bold" fill="#333">Customer ID</text>
                <text x="${OUTER_MARGIN + logoColW + labelColW/2}" y="${OUTER_MARGIN + rowH*3 + rowH/2 + 5}" font-family="Arial" font-size="11" text-anchor="middle" font-weight="bold" fill="#333">Job</text>
                <text x="${OUTER_MARGIN + logoColW + labelColW/2}" y="${OUTER_MARGIN + rowH*4 + rowH/2 + 5}" font-family="Arial" font-size="11" text-anchor="middle" font-weight="bold" fill="#333">Handler</text>
                <!-- Data fields (dynamic) -->
                <text id="infoBar-date" x="${OUTER_MARGIN + logoColW + labelColW + dataColW/2}" y="${OUTER_MARGIN + rowH/2 + 5}" font-family="Arial" font-size="11" text-anchor="middle" fill="#0066cc"></text>
                <text id="infoBar-customer" x="${OUTER_MARGIN + logoColW + labelColW + dataColW/2}" y="${OUTER_MARGIN + rowH*1 + rowH/2 + 5}" font-family="Arial" font-size="11" text-anchor="middle" fill="#0066cc"></text>
                <text id="infoBar-customerCode" x="${OUTER_MARGIN + logoColW + labelColW + dataColW/2}" y="${OUTER_MARGIN + rowH*2 + rowH/2 + 5}" font-family="Arial" font-size="11" text-anchor="middle" fill="#0066cc"></text>
                <text id="infoBar-job" x="${OUTER_MARGIN + logoColW + labelColW + dataColW/2}" y="${OUTER_MARGIN + rowH*3 + rowH/2 + 5}" font-family="Arial" font-size="11" text-anchor="middle" fill="#0066cc"></text>
                <text id="infoBar-handler" x="${OUTER_MARGIN + logoColW + labelColW + dataColW/2}" y="${OUTER_MARGIN + rowH*4 + rowH/2 + 5}" font-family="Arial" font-size="11" text-anchor="middle" fill="#0066cc"></text>
                <!-- Colors Section title -->
                <rect x="${OUTER_MARGIN + logoColW + labelColW + dataColW}" y="${OUTER_MARGIN}" width="${colorColW}" height="${rowH}" fill="#f5f5f5" stroke="#ccc" stroke-width="1"/>
                <text x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW / 2}" y="${OUTER_MARGIN + rowH / 2 + 5}" font-family="Arial" font-size="12" text-anchor="middle" font-weight="bold" fill="#333">Colors</text>
                <!-- Color numbers -->
                ${Array.from({ length: colorSwatchCount }).map((_, k) => {
                    const swW = colorColW / colorSwatchCount;
                    return `<rect x="${OUTER_MARGIN + logoColW + labelColW + dataColW + k * swW}" y="${OUTER_MARGIN + rowH}" width="${swW}" height="${rowH}" fill="#f5f5f5" stroke="#ccc" stroke-width="1"/>
                            <text x="${OUTER_MARGIN + logoColW + labelColW + dataColW + k * swW + swW / 2}" y="${OUTER_MARGIN + rowH + rowH / 2 + 5}" font-family="Arial" font-size="10" text-anchor="middle" font-weight="bold" fill="#333">${k + 1}</text>`;
                }).join('')}
                <!-- Colors actual cells row (swatches & names) -->
                <rect x="${OUTER_MARGIN + logoColW + labelColW + dataColW}" y="${OUTER_MARGIN + rowH * 2}" width="${colorColW}" height="${colorCellH}" fill="#fff" stroke="#ccc" stroke-width="1"/>
                <g id="infoBar-colors"></g>
                <!-- Empty cell below colors (spacing) -->
                <rect x="${OUTER_MARGIN + logoColW + labelColW + dataColW}" y="${OUTER_MARGIN + rowH * 4}" width="${colorColW}" height="${rowH}" fill="#fff" stroke="#ccc" stroke-width="1"/>
                <!-- Right columns (5 rows x 4 columns) -->
                ${Array.from({ length: 4 }).map((_, col) =>
                    yRow.map((y, row) => {
                        const x = OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + col * 45;
                        return `<rect x="${x}" y="${y}" width="45" height="${rowH}" fill="${col % 2 === 0 ? '#f5f5f5' : '#fff'}" stroke="#ccc" stroke-width="1"/>`;
                    }).join('')
                ).join('')}
                <!-- Right column labels -->
                <text x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 22.5}" y="${OUTER_MARGIN + rowH / 2 + 5}" font-family="Arial" font-size="10" text-anchor="middle" font-weight="bold" fill="#333">Machine</text>
                <text x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 22.5}" y="${OUTER_MARGIN + rowH*1 + rowH/2 + 5}" font-family="Arial" font-size="10" text-anchor="middle" font-weight="bold" fill="#333">Film</text>
                <text x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 22.5}" y="${OUTER_MARGIN + rowH*2 + rowH/2 + 5}" font-family="Arial" font-size="10" text-anchor="middle" font-weight="bold" fill="#333">Side</text>
                <text x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 22.5}" y="${OUTER_MARGIN + rowH*3 + rowH/2 + 5}" font-family="Arial" font-size="10" text-anchor="middle" font-weight="bold" fill="#333">Unit W</text>
                <text x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 22.5}" y="${OUTER_MARGIN + rowH*4 + rowH/2 + 5}" font-family="Arial" font-size="10" text-anchor="middle" font-weight="bold" fill="#333">Unit H</text>
                <!-- Right column values -->
                <text id="infoBar-machineType" x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 67.5}" y="${OUTER_MARGIN + rowH/2 + 5}" font-family="Arial" font-size="10" text-anchor="middle" fill="#0066cc"></text>
                <text id="infoBar-filmStructure" x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 67.5}" y="${OUTER_MARGIN + rowH*1 + rowH/2 + 5}" font-family="Arial" font-size="10" text-anchor="middle" fill="#0066cc"></text>
                <text id="infoBar-printingSide" x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 67.5}" y="${OUTER_MARGIN + rowH*2 + rowH/2 + 5}" font-family="Arial" font-size="10" text-anchor="middle" fill="#0066cc"></text>
                <text id="infoBar-unitWidth" x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 67.5}" y="${OUTER_MARGIN + rowH*3 + rowH/2 + 5}" font-family="Arial" font-size="10" text-anchor="middle" fill="#0066cc"></text>
                <text id="infoBar-unitHeight" x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 67.5}" y="${OUTER_MARGIN + rowH*4 + rowH/2 + 5}" font-family="Arial" font-size="10" text-anchor="middle" fill="#0066cc"></text>
                <!-- Rep labels -->
                <text x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 112.5}" y="${OUTER_MARGIN + rowH/2 + 5}" font-family="Arial" font-size="9" text-anchor="middle" font-weight="bold" fill="#333">Rep.Bsd</text>
                <text x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 112.5}" y="${OUTER_MARGIN + rowH*1 + rowH/2 + 5}" font-family="Arial" font-size="9" text-anchor="middle" font-weight="bold" fill="#333">Rep.Bhd</text>
                <text x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 112.5}" y="${OUTER_MARGIN + rowH*2 + rowH/2 + 5}" font-family="Arial" font-size="9" text-anchor="middle" font-weight="bold" fill="#333">Tot W</text>
                <text x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 112.5}" y="${OUTER_MARGIN + rowH*3 + rowH/2 + 5}" font-family="Arial" font-size="9" text-anchor="middle" font-weight="bold" fill="#333">Sleeve</text>
                <!-- Rep values -->
                <text id="infoBar-repBeside" x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 157.5}" y="${OUTER_MARGIN + rowH/2 + 5}" font-family="Arial" font-size="10" text-anchor="middle" fill="#0066cc"></text>
                <text id="infoBar-repBehind" x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 157.5}" y="${OUTER_MARGIN + rowH*1 + rowH/2 + 5}" font-family="Arial" font-size="10" text-anchor="middle" fill="#0066cc"></text>
                <text id="infoBar-totalWidth" x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 157.5}" y="${OUTER_MARGIN + rowH*2 + rowH/2 + 5}" font-family="Arial" font-size="10" text-anchor="middle" fill="#0066cc"></text>
                <text id="infoBar-sleeve" x="${OUTER_MARGIN + logoColW + labelColW + dataColW + colorColW + 157.5}" y="${OUTER_MARGIN + rowH*3 + rowH/2 + 5}" font-family="Arial" font-size="10" text-anchor="middle" fill="#0066cc"></text>
            </svg>
        </div>
    `;
    previewContainer.appendChild(infoBarDiv);
}

function setupInfoBarPopulation() {
    populateInfoBar();
    const fields = [
        'customer-name', 'customer-code', 'entry-date', 'job-number', 'job-name',
        'salesman', 'product-type', 'press-type', 'quantity', 'widthInput', 'heightInput', 'gussetInput', 'flapInput',
        'print-orientation', 'unwinding-direction', 'horizontal-count', 'vertical-count'
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', populateInfoBar);
            el.addEventListener('change', populateInfoBar);
        }
    });
    if (window.colorFields && typeof window.colorFields.setupContainer === 'function') {
        setInterval(populateInfoBar, 1000);
    }
    document.addEventListener('jobSelected', populateInfoBar);
}

function populateInfoBar() {
    document.getElementById('infoBar-date').textContent = getValueOrEmpty('entry-date');
    document.getElementById('infoBar-customer').textContent = getValueOrEmpty('customer-name');
    document.getElementById('infoBar-customerCode').textContent = getValueOrEmpty('customer-code');
    // Show job id before job name
    const jobNum = getValueOrEmpty('job-number');
    const jobName = getValueOrEmpty('job-name');
    document.getElementById('infoBar-job').textContent = (jobNum ? jobNum : '') + (jobNum && jobName ? ' - ' : '') + (jobName ? jobName : '');

let handlerDisplayName = '';
if (window.prepressData && window.prepressData.handler_full_name) {
    handlerDisplayName = window.prepressData.handler_full_name;
} else {
    handlerDisplayName = getValueOrEmpty('salesman');
}
document.getElementById('infoBar-handler').textContent = handlerDisplayName;

    // Colors Section
    const colorsGroup = document.getElementById('infoBar-colors');
    colorsGroup.innerHTML = '';
    let colors = [];
    if (window.colorFields && typeof window.colorFields.collectColors === 'function') {
        colors = window.colorFields.collectColors();
    } else if (window.prepressData && Array.isArray(window.prepressData.colors)) {
        colors = window.prepressData.colors;
    }

    // Responsive color swatches and names
    const OUTER_MARGIN = 10;
    const logoColW = 80;
    const labelColW = 80;
    const dataColW = 240;
    const colorColW = 240;
    const rowH = 22;
    const colorSwatchCount = 10;
    const swW = colorColW / colorSwatchCount;
    const ySwatch = OUTER_MARGIN + rowH * 2 + 4;
    const hSwatch = 14;

    for (let i = 0; i < colorSwatchCount; i++) {
        const x = OUTER_MARGIN + logoColW + labelColW + dataColW + i * swW + 2;
        if (colors && colors[i]) {
            colorsGroup.innerHTML += `
                <rect x="${x}" y="${ySwatch}" width="${swW - 4}" height="${hSwatch}" fill="${colors[i].code || '#eee'}" stroke="gray" stroke-width="1"/>
                <text x="${x + (swW - 4) / 2}" y="${ySwatch + hSwatch + 11}" font-family="Arial" font-size="8" text-anchor="middle" fill="#222">${colors[i].name || ''}</text>
            `;
        } else {
            colorsGroup.innerHTML += `
                <rect x="${x}" y="${ySwatch}" width="${swW - 4}" height="${hSwatch}" fill="#fff" stroke="#eee" stroke-width="1"/>
            `;
        }
    }

    // Machine Type, Film Structure, Printing Side, Unit Width/Height
    document.getElementById('infoBar-machineType').textContent = getValueOrEmpty('press-type');
    document.getElementById('infoBar-filmStructure').textContent = getValueOrEmpty('product-type');
    document.getElementById('infoBar-printingSide').textContent = getValueOrEmpty('print-orientation');
    document.getElementById('infoBar-unitWidth').textContent = getValueOrEmpty('widthInput');
    document.getElementById('infoBar-unitHeight').textContent = getValueOrEmpty('heightInput');

    // Repetition fields
    document.getElementById('infoBar-repBeside').textContent = getValueOrEmpty('horizontal-count');
    document.getElementById('infoBar-repBehind').textContent = getValueOrEmpty('vertical-count');
    let width = parseFloat(getValueOrEmpty('widthInput'));
    let repBeside = parseInt(getValueOrEmpty('horizontal-count')) || 1;
    document.getElementById('infoBar-totalWidth').textContent = width && repBeside ? (width * repBeside) : '';
    document.getElementById('infoBar-sleeve').textContent = getValueOrEmpty('gussetInput') || getValueOrEmpty('flapInput');
}

function getValueOrEmpty(id) {
    const el = document.getElementById(id);
    if (!el) return '';
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
        return el.value ? el.value.trim() : '';
    }
    return el.textContent ? el.textContent.trim() : '';
}