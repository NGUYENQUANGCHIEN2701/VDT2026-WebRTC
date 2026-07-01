const fs = require('fs');
let css = fs.readFileSync('src/index.css', 'utf-8');

// 1. body gradient
css = css.replace(/body\s*\{\s*margin:\s*0;\s*min-width:\s*320px;\s*background:\s*radial-gradient[^;]+;[\s\S]*?\}/, 'body {\n  margin: 0;\n  min-width: 320px;\n  background: var(--bg);\n}');

// 2. auth-page--dark gradient
css = css.replace(/(\.auth-page--dark\s*\{[^}]*?)background:\s*radial-gradient[\s\S]*?linear-gradient[^;]+;/g, '$1background: #06172f;');

// 3. auth-page--light gradient
css = css.replace(/(\.auth-page--light\s*\{[^}]*?)background:\s*radial-gradient[\s\S]*?linear-gradient[^;]+;/g, '$1background: #f8fbff;');

// 4. auth-stage::before (decorative pattern) - Just remove before/after pseudo elements entirely
css = css.replace(/\.auth-stage::before,\s*\.auth-stage::after\s*\{[\s\S]*?\}\s*\.auth-stage::before\s*\{[\s\S]*?\}\s*\.auth-stage::after\s*\{[\s\S]*?\}/g, '');

// 5. auth-brand-mark gradient
css = css.replace(/(\.auth-brand-mark\s*\{[^}]*?)background:\s*linear-gradient[^;]+;(\s*box-shadow:\s*[^\n]+;)/g, '$1background: #0f63ff;$2');

// 6. auth-orb::before gradient
css = css.replace(/(\.auth-orb::before\s*\{[^}]*?)background:\s*linear-gradient[^;]+;/g, '$1background: #1267ff;');

// 7. auth-submit gradient
css = css.replace(/(\.auth-submit\s*\{[^}]*?)background:\s*linear-gradient[^;]+;/g, '$1background: #1267ff;');

// 8. app root container gradient
css = css.replace(/(\.app\s*\{[^}]*?)background:\s*radial-gradient[\s\S]*?var\(--bg\);/g, '$1background: var(--bg);');

fs.writeFileSync('src/index.css', css);
console.log('Fixed CSS gradients');
