export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { to, subject, text, apiKey } = req.body;

    if (!to || !subject || !text || !apiKey) {
        return res.status(400).send('Missing parameters');
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                from: 'SemiNuevo Agency <onboarding@resend.dev>', // Usar dominio de prueba de Resend
                to: [to],
                subject: subject,
                text: text
            })
        });

        const data = await response.json();

        if (response.ok) {
            return res.status(200).json(data);
        } else {
            console.error('Resend Error:', data);
            return res.status(response.status).send(data.message || 'Error sending email');
        }
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).send('Internal Server Error');
    }
}
