const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const headMatch = html.match(/<head>[\s\S]*?<\/head>/i);
const navMatch = html.match(/<nav class="navbar"[\s\S]*?<\/nav>/i);
const footerMatch = html.match(/<footer class="footer"[\s\S]*?<\/footer>/i);

const newHtml = `<!DOCTYPE html>
<html lang="es">
${headMatch[0]}
<body>
    ${navMatch[0]}

    <section class="car-detail-page" style="padding-top: 150px; min-height: 80vh;">
        <div class="container" id="carDetailContainer">
            <div style="display:flex; justify-content:center; align-items:center; height: 50vh; flex-direction:column;">
                <div class="loader-spinner"></div>
                <p style="margin-top: 20px; color: var(--on-surface-variant);">Cargando detalles del vehículo...</p>
            </div>
        </div>
    </section>

    ${footerMatch ? footerMatch[0] : ''}

    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="supabase-config.js"></script>
    <script src="data.js"></script>
    <script src="vehiculo.js"></script>
</body>
</html>`;

fs.writeFileSync('vehiculo.html', newHtml);
console.log('vehiculo.html created successfully');
