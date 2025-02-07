document.addEventListener('DOMContentLoaded', () => {
    const qrCodeImg = document.getElementById('qr-code');
    const qrContainer = document.getElementById('qr-container');
    const messageForm = document.getElementById('message-form');
    const sendMessageForm = document.getElementById('send-message-form');
    const sendBulkForm = document.getElementById('send-bulk-form');
    const excelFileInput = document.getElementById('excel-file');
    const phoneNumberInput = document.getElementById('phone-number');
    const messageInput = document.getElementById('message');
    const imageFileInput = document.getElementById('image-file');
    const resetButton = document.getElementById('reset-button');
    let isBulkMessage = false;

    // Fetch QR Code from server
    fetch('/qr')
        .then(response => response.json())
        .then(data => {
            if (data.qr) {
                qrCodeImg.src = data.qr;
            } else {
                qrContainer.innerHTML = "<h3>WhatsApp is already connected!</h3>";
                messageForm.style.display = 'block'; // Show message form when connected
            }
        })
        .catch(error => {
            console.error("Error fetching QR Code:", error);
            qrContainer.innerHTML = "<h3>Failed to fetch QR Code. Please try again later.</h3>";
        });

    // Handle sending individual message
    sendMessageForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const phoneNumber = phoneNumberInput.value.trim();
        const message = messageInput.value.trim();
        const imageFile = imageFileInput.files[0];

        // Ensure phone number and message are provided
        if (!phoneNumber || !message) {
            alert("Please enter both phone number and message!");
            return;
        }

        const formData = new FormData();
        formData.append("phoneNumber", phoneNumber);
        formData.append("message", message);

        if (imageFile) {
            // Check if the image is valid (only jpeg or png)
            if (!['image/jpeg', 'image/png'].includes(imageFile.type)) {
                alert('Please upload a valid image (JPEG or PNG).');
                return;
            }
            formData.append("image", imageFile);
        }

        // Add loading feedback before sending
        sendMessageForm.querySelector('button').textContent = "Sending..."; // Update button text
        sendMessageForm.querySelector('button').disabled = true; // Disable button while sending
        try {
            const response = await fetch('/send-message', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            alert(result.success || result.error);
        } catch (error) {
            alert("An error occurred: " + error.message);
        } finally {
            sendMessageForm.querySelector('button').textContent = "Send Message"; // Reset button text
            sendMessageForm.querySelector('button').disabled = false; // Re-enable button
        }
    });

    // Handle sending bulk message with Excel file
    sendBulkForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const excelFile = excelFileInput.files[0];
        const imageFile = imageFileInput.files[0];  // Image file for bulk send, if any

        if (!excelFile) {
            alert("Please upload an Excel file!");
            return;
        }

        const formData = new FormData();
        formData.append("excel", excelFile);
        if (imageFile) {
            // Check if the image is valid (only jpeg or png)
            if (!['image/jpeg', 'image/png'].includes(imageFile.type)) {
                alert('Please upload a valid image (JPEG or PNG).');
                return;
            }
            formData.append("image", imageFile); // Attach image if present
        }

        // Add loading feedback before sending
        sendBulkForm.querySelector('button').textContent = "Sending..."; // Update button text
        sendBulkForm.querySelector('button').disabled = true; // Disable button while sending
        try {
            const response = await fetch('/send-message', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            alert(result.success || result.error);
        } catch (error) {
            alert("An error occurred: " + error.message);
        } finally {
            sendBulkForm.querySelector('button').textContent = "Send Bulk Message"; // Reset button text
            sendBulkForm.querySelector('button').disabled = false; // Re-enable button
        }
    });

    // Enable or disable fields based on the presence of an Excel file
    excelFileInput.addEventListener('change', () => {
        if (excelFileInput.files.length > 0) {
            isBulkMessage = true;
            phoneNumberInput.disabled = true;
            messageInput.disabled = true;
            imageFileInput.disabled = true; // Disable image file input for bulk message
            sendMessageForm.style.display = 'none';  // Hide individual message form
            sendBulkForm.style.display = 'block';   // Show bulk message form
        } else {
            isBulkMessage = false;
            phoneNumberInput.disabled = false;
            messageInput.disabled = false;
            imageFileInput.disabled = false;
            sendMessageForm.style.display = 'block'; // Show individual message form
            sendBulkForm.style.display = 'none';    // Hide bulk message form
        }
    });

    // Reset form when switching between manual and bulk messaging
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            sendMessageForm.reset();
            sendBulkForm.reset();
            excelFileInput.value = ''; // Reset file input
            phoneNumberInput.disabled = false;
            messageInput.disabled = false;
            imageFileInput.disabled = false;
            sendMessageForm.style.display = 'block';
            sendBulkForm.style.display = 'none';
        });
    }
});
