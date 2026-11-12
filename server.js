// Automatically apply compatibility patch for whatsapp-web.js if needed
try {
    require('./patch-wwebjs')();
} catch (e) {
    console.warn('⚠️ Could not run patch-wwebjs:', e.message);
}

const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeImage = require('qrcode');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Setup file upload using multer
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // Max 10MB
});

// WhatsApp client configuration
// Set HEADLESS=false in environment to show Chrome window if desired
const isHeadless = process.env.HEADLESS !== 'false';

const client = new Client({
    puppeteer: {
        headless: isHeadless,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    },
    authStrategy: new LocalAuth({
        clientId: 'my-session'
    })
});

// State tracking
let isClientReady = false;
let qrCodeData = '';
let clientStatus = 'INITIALIZING'; // INITIALIZING | QR_READY | AUTHENTICATED | READY | DISCONNECTED | AUTH_FAILURE

// Client Events
client.on('qr', async (qr) => {
    try {
        qrCodeData = await qrcodeImage.toDataURL(qr);
        clientStatus = 'QR_READY';
        console.log('⚡ New QR Code generated, ready to scan.');
    } catch (err) {
        console.error('❌ Error generating QR code image:', err);
    }
});

client.on('authenticated', () => {
    clientStatus = 'AUTHENTICATED';
    console.log('🔑 WhatsApp authenticated successfully.');
});

client.on('auth_failure', (msg) => {
    clientStatus = 'AUTH_FAILURE';
    isClientReady = false;
    console.error('❌ WhatsApp authentication failure:', msg);
});

client.on('ready', () => {
    isClientReady = true;
    clientStatus = 'READY';
    qrCodeData = '';
    console.log('✅ WhatsApp Web is ready and connected!');
});

client.on('disconnected', (reason) => {
    isClientReady = false;
    clientStatus = 'DISCONNECTED';
    qrCodeData = '';
    console.log(`❌ WhatsApp disconnected: ${reason}`);
});

// Status check interval (logs status without destroying client)
setInterval(() => {
    if (isClientReady) {
        console.log('✅ WhatsApp client is running normally.');
    } else {
        console.log(`ℹ️ WhatsApp status: ${clientStatus}`);
    }
}, 60000);

// Endpoint for QR Code and client status
app.get('/qr', (req, res) => {
    const userInfo = isClientReady && client.info ? (client.info.pushname || client.info.wid.user) : null;
    res.json({
        status: clientStatus,
        ready: isClientReady,
        qr: qrCodeData,
        user: userInfo
    });
});

app.get('/status', (req, res) => {
    const userInfo = isClientReady && client.info ? (client.info.pushname || client.info.wid.user) : null;
    res.json({
        status: clientStatus,
        ready: isClientReady,
        user: userInfo
    });
});

// Main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint to download Excel template for bulk sending
app.get('/download-template', (req, res) => {
    try {
        const sampleData = [
            {
                PhoneNumber: '081234567890',
                Message: 'Halo Budi, ini contoh pesan blast otomatis.',
                image: ''
            },
            {
                PhoneNumber: '628987654321',
                Message: 'Hai Siti, jangan lewatkan promo spesial hari ini!',
                image: ''
            }
        ];

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(sampleData, {
            header: ['PhoneNumber', 'Message', 'image']
        });

        // Column widths
        worksheet['!cols'] = [
            { wch: 18 }, // PhoneNumber
            { wch: 55 }, // Message
            { wch: 25 }  // image (opsional)
        ];

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Blast Template');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="template_blast.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        console.error('Error generating template:', err);
        res.status(500).send('Gagal membuat template Excel');
    }
});

// Helper function to format phone numbers (e.g. 08123... / 8123... / +62812... -> 62812...)
function formatPhoneNumber(number) {
    if (!number) return '';
    let cleaned = String(number).trim().replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '62' + cleaned.slice(1);
    } else if (cleaned.startsWith('8')) {
        cleaned = '62' + cleaned;
    }
    return cleaned;
}

// Function to send single WhatsApp message
async function sendMessage(phoneNumber, message, image) {
    if (!isClientReady || !client.info || !client.info.wid) {
        throw new Error('WhatsApp belum terhubung. Silakan scan QR code terlebih dahulu.');
    }

    const chatId = `${phoneNumber}@c.us`;

    try {
        if (image) {
            const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
            if (!allowedMimes.includes(image.mimetype)) {
                throw new Error('Hanya format gambar JPEG, PNG, dan WebP yang didukung.');
            }

            const media = new MessageMedia(
                image.mimetype,
                image.buffer.toString('base64'),
                image.originalname || 'image'
            );

            // Send image with caption
            await client.sendMessage(chatId, media, { caption: message || '' });
            console.log(`✅ Gambar dan pesan terkirim ke ${phoneNumber}`);
        } else {
            await client.sendMessage(chatId, message);
            console.log(`✅ Pesan teks terkirim ke ${phoneNumber}`);
        }
    } catch (error) {
        console.error(`❌ Gagal mengirim ke ${phoneNumber}:`, error.message);
        throw error;
    }
}

// Helper to look up column values flexibly
function getRowValue(row, possibleNames) {
    for (const name of possibleNames) {
        for (const key of Object.keys(row)) {
            if (key.trim().toLowerCase() === name.toLowerCase()) {
                const val = row[key];
                return val !== undefined && val !== null ? String(val).trim() : '';
            }
        }
    }
    return '';
}

// Endpoint to send messages (Single or Bulk Excel)
app.post('/send-message', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'excel', maxCount: 1 }
]), async (req, res) => {
    try {
        if (!isClientReady) {
            return res.status(503).json({
                error: 'WhatsApp belum siap. Pastikan Anda sudah scan QR code dan berstatus terhubung.'
            });
        }

        // Bulk send via Excel
        if (req.files && req.files['excel']) {
            const excelBuffer = req.files['excel'][0].buffer;
            const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

            if (!data || data.length === 0) {
                return res.status(400).json({ error: 'File Excel kosong atau tidak memiliki baris data.' });
            }

            // Default image from form upload, if any
            let formImage = null;
            if (req.files && req.files['image']) {
                const img = req.files['image'][0];
                formImage = {
                    buffer: img.buffer,
                    mimetype: img.mimetype,
                    originalname: img.originalname
                };
            }

            const results = {
                total: data.length,
                successCount: 0,
                failedCount: 0,
                errors: []
            };

            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                const rawPhone = getRowValue(row, ['phonenumber', 'phone number', 'phone', 'telepon', 'nomor', 'no_hp', 'nohp', 'no']);
                const rawMessage = getRowValue(row, ['message', 'pesan', 'text', 'pesan_whatsapp']);
                const rawImagePath = getRowValue(row, ['image', 'imagepath', 'gambar', 'foto']);

                if (!rawPhone || !rawMessage) {
                    results.failedCount++;
                    results.errors.push(`Baris ${i + 2}: Nomor telepon atau pesan kosong.`);
                    continue;
                }

                const formattedNumber = formatPhoneNumber(rawPhone);
                if (!formattedNumber || formattedNumber.length < 9) {
                    results.failedCount++;
                    results.errors.push(`Baris ${i + 2}: Nomor telepon tidak valid (${rawPhone}).`);
                    continue;
                }

                // Check row-specific image path
                let rowImage = null;
                if (rawImagePath) {
                    const resolvedPath = path.resolve(rawImagePath);
                    if (fs.existsSync(resolvedPath)) {
                        const ext = path.extname(resolvedPath).toLowerCase();
                        let mime = 'image/jpeg';
                        if (ext === '.png') mime = 'image/png';
                        else if (ext === '.webp') mime = 'image/webp';

                        rowImage = {
                            buffer: fs.readFileSync(resolvedPath),
                            mimetype: mime,
                            originalname: path.basename(resolvedPath)
                        };
                    }
                }

                const imageToSend = rowImage || formImage;

                try {
                    await sendMessage(formattedNumber, rawMessage, imageToSend);
                    results.successCount++;
                } catch (err) {
                    results.failedCount++;
                    results.errors.push(`Baris ${i + 2} (${formattedNumber}): ${err.message}`);
                }

                // Delay 3 seconds between messages to reduce spam ban risk
                if (i < data.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }

            return res.json({
                success: `Selesai! Berhasil terkirim: ${results.successCount}, Gagal: ${results.failedCount} (dari total ${results.total}).`,
                details: results
            });
        }

        // Single message
        const { phoneNumber, message } = req.body;
        if (!phoneNumber || !message) {
            return res.status(400).json({ error: 'Nomor telepon dan pesan wajib diisi.' });
        }

        const formattedNumber = formatPhoneNumber(phoneNumber);
        if (!formattedNumber || formattedNumber.length < 9) {
            return res.status(400).json({ error: 'Format nomor telepon tidak valid.' });
        }

        let image = null;
        if (req.files && req.files['image']) {
            const img = req.files['image'][0];
            image = {
                buffer: img.buffer,
                mimetype: img.mimetype,
                originalname: img.originalname
            };
        }

        await sendMessage(formattedNumber, message, image);
        return res.json({ success: `✅ Pesan berhasil dikirim ke ${formattedNumber}` });

    } catch (err) {
        console.error('❌ Error handling send-message:', err.message);
        res.status(500).json({ error: 'Terjadi kesalahan: ' + err.message });
    }
});

// Initialize WhatsApp client
client.initialize();

// Start Express server
app.listen(port, () => {
    console.log(`🚀 Server berjalan di http://localhost:${port}`);
});
