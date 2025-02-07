const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeImage = require('qrcode');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Setup file upload using multer
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // Max 10MB file size
});

// Create WhatsApp client
const client = new Client({
    puppeteer: {
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    },
    authStrategy: new LocalAuth({
        clientId: "my-session"
    })
});

let qrCodeData = "";

// Generate QR Code
client.on("qr", async (qr) => {
    qrCodeData = await qrcodeImage.toDataURL(qr);
    console.log("QR Code updated");
});

// When connected
client.on("ready", () => {
    console.log("✅ WhatsApp Web is ready!");
    qrCodeData = "";
});

// Handle disconnection
client.on('disconnected', (reason) => {
    console.log(`❌ WhatsApp disconnected: ${reason}`);
    console.log('🔄 Restarting WhatsApp...');
    client.destroy().then(() => {
        setTimeout(() => {
            client.initialize();
        }, 5000);
    });
});

// Check WhatsApp status every minute
setInterval(async () => {
    if (!client.info) {
        console.log('⚠️ Client info not available, reinitializing...');
        client.destroy().then(() => client.initialize());
    } else {
        console.log('✅ WhatsApp is running fine...');
    }
}, 60000);

// Endpoint for QR Code
app.get("/qr", (req, res) => {
    if (qrCodeData) {
        res.json({ qr: qrCodeData });
    } else {
        res.json({ message: "WhatsApp is already connected or initializing..." });
    }
});

// Main endpoint for the HTML page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper function to format phone number for international format
function formatPhoneNumber(number) {
    if (number.startsWith("0")) {
        return "62" + number.slice(1); // Convert to Indonesian format
    }
    return number;
}

// Function to send message with or without image
async function sendMessage(phoneNumber, message, image) {
    if (!client.info || !client.info.wid) {
        throw new Error('WhatsApp client is not ready yet. Please wait...');
    }

    try {
        if (image) {
            // Check if the image type is valid (JPEG or PNG)
            if (!['image/jpeg', 'image/png'].includes(image.mimetype)) {
                throw new Error('Only JPEG and PNG images are supported.');
            }

            // Convert image buffer to MessageMedia
            const media = new MessageMedia(image.mimetype, image.buffer.toString('base64'), image.originalname);
            await client.sendMessage(`${phoneNumber}@c.us`, message, { media });
            console.log(`✅ Image and message sent to ${phoneNumber}`);
        } else {
            await client.sendMessage(`${phoneNumber}@c.us`, message);
            console.log(`✅ Message sent to ${phoneNumber}`);
        }
    } catch (error) {
        console.error('❌ Error sending message:', error.message);
        throw error;  // Re-throw to ensure proper error handling
    }
}

// Endpoint to send messages (with image or from Excel)
app.post('/send-message', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'excel', maxCount: 1 }]), async (req, res) => {
    const { phoneNumber, message } = req.body;

    try {
        // If an Excel file is provided, process bulk sending
        if (req.files && req.files['excel']) {
            const workbook = XLSX.read(req.files['excel'][0].buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

            console.log("Excel data:", data);

            // Ensure that the data contains 'PhoneNumber' and 'Message' columns
            if (!data.every(row => row['PhoneNumber'] && row['Message'] && row['image'])) {
                return res.status(400).json({ error: 'Excel sheet must contain both "PhoneNumber", "Message", and "image" columns.' });
            }

            // Prepare image if uploaded
            let image = null;
            if (req.files && req.files['image']) {
                const imageFile = req.files['image'][0];
                image = {
                    buffer: imageFile.buffer,
                    mimetype: imageFile.mimetype,
                    originalname: imageFile.originalname
                };
            }

            // Send message to each phone number in the Excel sheet
            for (const row of data) {
                const formattedNumber = formatPhoneNumber(String(row['PhoneNumber']));
                const textMessage = String(row['Message']);
                const imagePath = String(row['image']); // path of the image from Excel

                // Check if there is a valid image path (local path to image)
                let imageFile = null;
                if (imagePath) {
                    // Use fs to read the image from disk (if path is provided)
                    const imageFilePath = path.resolve(imagePath); // Convert to absolute path

                    if (fs.existsSync(imageFilePath)) {
                        const imageBuffer = fs.readFileSync(imageFilePath);
                        imageFile = {
                            buffer: imageBuffer,
                            mimetype: 'image/jpeg', // Or png based on file type
                            originalname: path.basename(imageFilePath)
                        };
                    }
                }

                await sendMessage(formattedNumber, textMessage, imageFile || image);
                await new Promise(resolve => setTimeout(resolve, 5000)); // Delay 5 seconds between messages
            }

            return res.json({ success: '✅ Messages sent from Excel file!' });
        }

        // For individual message
        if (!phoneNumber || !message) {
            return res.status(400).json({ error: 'Phone number and message are required.' });
        }

        const formattedNumber = formatPhoneNumber(phoneNumber);
        let image = null;

        // If there's an image, prepare it for sending
        if (req.files && req.files['image']) {
            const imageFile = req.files['image'][0];
            console.log("Image received:", imageFile.originalname);
            image = {
                buffer: imageFile.buffer,
                mimetype: imageFile.mimetype,
                originalname: imageFile.originalname
            };
        }

        await sendMessage(formattedNumber, message, image);
        return res.json({ success: `✅ Message sent to ${formattedNumber}` });

    } catch (err) {
        console.error('❌ Error sending message:', err.message);
        res.status(500).json({ error: '❌ Error sending message: ' + err.message });
    }
});

// Initialize WhatsApp client
client.initialize();

// Start the Express server
app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
});
