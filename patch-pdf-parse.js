const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'node_modules', 'pdf-parse', 'index.js');

if (fs.existsSync(filePath)) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('let isDebugMode = !module.parent;')) {
    content = content.replace(/let isDebugMode = !module\.parent;/g, 'let isDebugMode = false;');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Patched pdf-parse to disable debug mode.');
  }
}
