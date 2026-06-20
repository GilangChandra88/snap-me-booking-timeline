import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function rewriteFile(filename) {
  const filePath = join(__dirname, filename);
  let content = readFileSync(filePath, 'utf8');

  // Replace \u{HEX} with ${String.fromCodePoint(0xHEX)}
  const result = content.replace(/\\u\{([0-9A-Fa-f]+)\}/g, (match, hex) => {
    return `\${String.fromCodePoint(0x${hex})}`;
  });

  if (content !== result) {
    writeFileSync(filePath, result, 'utf8');
    console.log(`Rewrote Unicode escapes in ${filename}`);
  }
}

rewriteFile('src/components/TimelineStudio.tsx');
rewriteFile('src/components/CashierPage.tsx');
