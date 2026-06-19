const fs = require('fs');
let s = fs.readFileSync('script.js', 'utf8');

const regex = /let current = '';[\s\S]*?navLinks\.forEach[\s\S]*?\}\);/;
const replacement = `
// Set active nav link based on URL
const currentPath = window.location.pathname.split('/').pop() || 'index.html';
navLinks.forEach(link => {
    link.classList.remove('active');
    const href = link.getAttribute('href');
    if (href === currentPath || (href.startsWith(currentPath) && currentPath !== 'index.html')) {
        link.classList.add('active');
    }
});
`;

s = s.replace(regex, replacement);
fs.writeFileSync('script.js', s);
console.log('script.js nav logic updated');
