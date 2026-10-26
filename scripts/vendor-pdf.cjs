const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'js', 'vendor');
fs.mkdirSync(destination, { recursive: true });
for (const [source, target] of [
    ['jspdf/dist/jspdf.umd.min.js', 'jspdf.umd.min.js'],
    ['jspdf/LICENSE', 'jspdf-LICENSE.txt'],
    ['jspdf-autotable/dist/jspdf.plugin.autotable.min.js', 'jspdf.plugin.autotable.min.js'],
    ['jspdf-autotable/LICENSE.txt', 'jspdf-autotable-LICENSE.txt']
]) {
    fs.copyFileSync(path.join(root, 'node_modules', source), path.join(destination, target));
}
