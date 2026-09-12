import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const grammarDir = path.join(__dirname, 'grammars');
if (!fs.existsSync(grammarDir)) {
  fs.mkdirSync(grammarDir, { recursive: true });
}

const languages = ['javascript', 'typescript', 'tsx', 'python', 'go', 'java', 'ruby', 'rust', 'c', 'cpp'];
let done = 0;

console.log('Fetching Tree-sitter WASM grammars...');

languages.forEach((lang) => {
  const url = `https://cdn.jsdelivr.net/npm/@vscode/tree-sitter-wasm@latest/tree-sitter-${lang}.wasm`;
  const destPath = path.join(grammarDir, `tree-sitter-${lang}.wasm`);

  https.get(url, (response) => {
    if (response.statusCode === 200) {
      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        done++;
        console.log(`Downloaded tree-sitter-${lang}.wasm`);
        if (done === languages.length) console.log('Grammar fetch complete.');
      });
    } else {
      done++;
      console.log(`Skipped ${lang} (not available — will fall back to line-based chunking)`);
    }
  }).on('error', () => {
    done++;
    console.log(`Skipped ${lang} (network error — will fall back to line-based chunking)`);
  });
});