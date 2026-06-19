const fs = require('fs');

// 1. Read the current index.html
const html = fs.readFileSync('index.html', 'utf8');

// 2. Extract common parts
const headMatch = html.match(/<head>[\s\S]*?<\/head>/i);
const head = headMatch ? headMatch[0] : '';

const navMatch = html.match(/<nav class="navbar" id="navbar">[\s\S]*?<\/nav>/i);
const nav = navMatch ? navMatch[0] : '';

const sidebarMatch = html.match(/<!-- ===== SOCIAL SIDEBAR ===== -->[\s\S]*?<\/div>/i);
const sidebar = sidebarMatch ? sidebarMatch[0] : '';

const whatsappFloatMatch = html.match(/<!-- ===== FLOATING WHATSAPP ===== -->[\s\S]*?<\/a>/i);
const whatsappFloat = whatsappFloatMatch ? whatsappFloatMatch[0] : '';

const footerMatch = html.match(/<footer class="footer"[\s\S]*?<\/footer>/i) || html.match(/<footer[\s\S]*?<\/footer>/i);
const footer = footerMatch ? footerMatch[0] : '';

const scriptsMatch = html.match(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>[\s\S]*?<\/body>/i);
const scripts = scriptsMatch ? scriptsMatch[0] : '';

// 3. Extract sections
function getSection(regexStr) {
    const match = html.match(new RegExp(regexStr, 'i'));
    return match ? match[0] : '';
}

const hero = getSection('<!-- ===== HERO SECTION — VEHICLE SHOWCASE ===== -->[\\s\\S]*?</section>');
const nosotros = getSection('<!-- ===== NUESTRA HISTORIA \\(Intro after Hero\\) ===== -->[\\s\\S]*?</section>');
const brands = getSection('<!-- ===== BRAND LOGOS MARQUEE ===== -->[\\s\\S]*?</section>');
const stats = getSection('<!-- ===== STATS BAR ===== -->[\\s\\S]*?</section>');
const yaris = getSection('<!-- ===== EXCLUSIVE YARIS GR SECTION ===== -->[\\s\\S]*?</section>');
const catalogNavTabs = getSection('<!-- ===== CATALOG NAV TABS ===== -->[\\s\\S]*?</section>');
const seminuevos = getSection('<!-- ===== SEMINUEVOS SECTION ===== -->[\\s\\S]*?</section>');
const porpedido = getSection('<!-- ===== POR PEDIDO SECTION ===== -->[\\s\\S]*?</section>');
const zerokm = getSection('<!-- ===== 0KM SECTION ===== -->[\\s\\S]*?</section>');
const catalogCta = getSection('<!-- Catalog CTA -->[\\s\\S]*?</section>');
const legal = getSection('<!-- ===== LEGAL TRANSPARENCY SECTION ===== -->[\\s\\S]*?</section>');
const calculadora = getSection('<!-- ===== COST CALCULATOR SECTION ===== -->[\\s\\S]*?</section>');
const servicios = getSection('<!-- ===== SERVICES SECTION ===== -->[\\s\\S]*?</section>');

// Function to replace nav links in all pages
function generateNav() {
    let newNav = nav.replace(/href="#inicio"/g, 'href="index.html"');
    newNav = newNav.replace(/href="#catalogo"/g, 'href="catalogo.html"');
    newNav = newNav.replace(/href="#calculadora"/g, 'href="calculadora.html"');
    newNav = newNav.replace(/href="#beneficios"/g, 'href="servicios.html"');
    newNav = newNav.replace(/href="#nosotros"/g, 'href="nosotros.html"');
    return newNav;
}

const finalNav = generateNav();

function buildPage(content, addPadding = true) {
    return `<!DOCTYPE html>
<html lang="es">
${head}
<body>
${finalNav}
${sidebar}
${whatsappFloat}

${addPadding ? '<div style="padding-top: 100px;"></div>' : ''}

${content}

${footer}

${scripts}
</html>`;
}

// Build index.html (Home)
// We remove the padding for index so hero is full
let indexContent = buildPage(`${hero}\n${brands}\n${stats}\n${yaris}`, false);
fs.writeFileSync('index.html', indexContent);

// Build catalogo.html
let catalogContent = `${catalogNavTabs}\n${seminuevos}\n${porpedido}\n${zerokm}\n${catalogCta}\n${legal}`;
fs.writeFileSync('catalogo.html', buildPage(catalogContent));

// Build nosotros.html
fs.writeFileSync('nosotros.html', buildPage(nosotros));

// Build servicios.html
fs.writeFileSync('servicios.html', buildPage(servicios));

// Build calculadora.html
fs.writeFileSync('calculadora.html', buildPage(calculadora));

// Modify vehiculo.html nav as well
if(fs.existsSync('vehiculo.html')) {
    let vehHtml = fs.readFileSync('vehiculo.html', 'utf8');
    vehHtml = vehHtml.replace(/<nav class="navbar" id="navbar">[\s\S]*?<\/nav>/i, finalNav);
    fs.writeFileSync('vehiculo.html', vehHtml);
}

console.log('Pages split successfully!');
