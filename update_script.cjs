const fs = require('fs');
let s = fs.readFileSync('script.js', 'utf8');

// The replacement we want: when openModal is called, we just redirect.
// Original signature is: async function openModal(carIdStr) {
// We replace the body of that function.
s = s.replace(
  /async function openModal\(carIdStr\) \{[\s\S]*?modalGallery\.init\(car\.images\);/g,
  "async function openModal(carIdStr) { window.location.href = 'vehiculo.html?id=' + carIdStr; return; // "
);

fs.writeFileSync('script.js', s);
console.log('script.js updated');
