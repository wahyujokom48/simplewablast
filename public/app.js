document.addEventListener('DOMContentLoaded', () => {
    const statusBadge = document.getElementById('status-badge');
    const qrContainer = document.getElementById('qr-container');
    const qrInstruction = document.getElementById('qr-instruction');
    const qrLoading = document.getElementById('qr-loading');
    const qrCodeImg = document.getElementById('qr-code');
    const messageFormContainer = document.getElementById('message-form');
    const resultBox = document.getElementById('result-box');

    const sendMessageForm = document.getElementById('send-message-form');
    const sendBulkForm = document.getElementById('send-bulk-form');
    const singleSubmitBtn = document.getElementById('send-single-message-btn');
    const bulkSubmitBtn = document.getElementById('send-bulk-message-btn');

    // Single Image Elements
    const singleImageInput = document.getElementById('image-file');
    const singleImagePreviewBox = document.getElementById('single-image-preview-box');
    const singleImageThumb = document.getElementById('single-image-thumb');
    const singleImageName = document.getElementById('single-image-name');
    const singleImageSize = document.getElementById('single-image-size');
    const clearSingleImageBtn = document.getElementById('clear-single-image-btn');

    // Bulk Excel Elements
    const excelFileInput = document.getElementById('excel-file');
    const excelPreviewBox = document.getElementById('excel-preview-box');
    const excelFilename = document.getElementById('excel-filename');
    const excelFilesize = document.getElementById('excel-filesize');
    const clearExcelBtn = document.getElementById('clear-excel-btn');

    // Bulk Image Elements
    const bulkImageInput = document.getElementById('bulk-image-file');
    const bulkImagePreviewBox = document.getElementById('bulk-image-preview-box');
    const bulkImageThumb = document.getElementById('bulk-image-thumb');
    const bulkImageName = document.getElementById('bulk-image-name');
    const bulkImageSize = document.getElementById('bulk-image-size');
    const clearBulkImageBtn = document.getElementById('clear-bulk-image-btn');

    let pollInterval = null;
    let isConnected = false;

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function showResult(message, isError = false) {
        resultBox.textContent = message;
        resultBox.className = 'result-box ' + (isError ? 'error' : 'success');
        resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function clearResult() {
        resultBox.textContent = '';
        resultBox.className = 'result-box';
    }

    // Setup Image Preview & Clear Button (✕)
    function setupImagePreview(inputEl, boxEl, thumbEl, nameEl, sizeEl, clearBtnEl) {
        inputEl.addEventListener('change', () => {
            if (inputEl.files && inputEl.files[0]) {
                const file = inputEl.files[0];
                nameEl.textContent = file.name;
                sizeEl.textContent = formatBytes(file.size);

                const reader = new FileReader();
                reader.onload = (e) => {
                    thumbEl.src = e.target.result;
                    boxEl.style.display = 'flex';
                };
                reader.readAsDataURL(file);
            } else {
                boxEl.style.display = 'none';
            }
        });

        clearBtnEl.addEventListener('click', () => {
            inputEl.value = '';
            thumbEl.src = '';
            nameEl.textContent = '';
            sizeEl.textContent = '';
            boxEl.style.display = 'none';
        });
    }

    // Setup Excel Preview & Clear Button (✕)
    function setupExcelPreview(inputEl, boxEl, nameEl, sizeEl, clearBtnEl) {
        inputEl.addEventListener('change', () => {
            if (inputEl.files && inputEl.files[0]) {
                const file = inputEl.files[0];
                nameEl.textContent = file.name;
                sizeEl.textContent = formatBytes(file.size);
                boxEl.style.display = 'flex';
            } else {
                boxEl.style.display = 'none';
            }
        });

        clearBtnEl.addEventListener('click', () => {
            inputEl.value = '';
            nameEl.textContent = '';
            sizeEl.textContent = '';
            boxEl.style.display = 'none';
        });
    }

    setupImagePreview(singleImageInput, singleImagePreviewBox, singleImageThumb, singleImageName, singleImageSize, clearSingleImageBtn);
    setupImagePreview(bulkImageInput, bulkImagePreviewBox, bulkImageThumb, bulkImageName, bulkImageSize, clearBulkImageBtn);
    setupExcelPreview(excelFileInput, excelPreviewBox, excelFilename, excelFilesize, clearExcelBtn);

    // Polling WhatsApp Connection Status
    async function checkStatus() {
        try {
            const res = await fetch('/qr');
            if (!res.ok) throw new Error('Gagal menghubungi server');
            const data = await res.json();

            if (data.ready) {
                isConnected = true;
                statusBadge.textContent = `✅ Terhubung sebagai: ${data.user || 'WhatsApp User'}`;
                statusBadge.className = 'status-badge connected';

                qrContainer.style.display = 'none';
                messageFormContainer.style.display = 'block';

                // Switch to slower polling once connected
                if (pollInterval) {
                    clearInterval(pollInterval);
                    pollInterval = setInterval(checkStatus, 8000);
                }
            } else if (data.status === 'QR_READY' && data.qr) {
                isConnected = false;
                statusBadge.textContent = '⚡ Menunggu Scan QR Code';
                statusBadge.className = 'status-badge qr';

                qrInstruction.textContent = 'Pindai / Scan QR Code dengan WhatsApp di HP Anda';
                qrLoading.style.display = 'none';
                qrCodeImg.src = data.qr;
                qrCodeImg.style.display = 'block';

                qrContainer.style.display = 'block';
                messageFormContainer.style.display = 'none';
            } else if (data.status === 'DISCONNECTED') {
                isConnected = false;
                statusBadge.textContent = '❌ WhatsApp Terputus';
                statusBadge.className = 'status-badge disconnected';

                qrInstruction.textContent = 'WhatsApp terputus. Menunggu sesi baru...';
                qrLoading.style.display = 'block';
                qrCodeImg.style.display = 'none';

                qrContainer.style.display = 'block';
                messageFormContainer.style.display = 'none';
            } else {
                // INITIALIZING / AUTHENTICATED
                isConnected = false;
                statusBadge.textContent = '⏳ Memuat WhatsApp Web...';
                statusBadge.className = 'status-badge';

                qrInstruction.textContent = 'Menyiapkan sesi WhatsApp...';
                qrLoading.style.display = 'block';
                qrCodeImg.style.display = 'none';
            }
        } catch (err) {
            statusBadge.textContent = '⚠️ Server tidak dapat dijangkau';
            statusBadge.className = 'status-badge disconnected';
            console.error('Status check error:', err);
        }
    }

    // Start polling every 2.5 seconds
    pollInterval = setInterval(checkStatus, 2500);
    checkStatus();

    // Handle Single Message Form Submission
    sendMessageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearResult();

        if (!isConnected) {
            alert('WhatsApp belum terhubung. Pastikan scan QR code terlebih dahulu.');
            return;
        }

        const phoneNumber = document.getElementById('phone-number').value.trim();
        const message = document.getElementById('message').value.trim();
        const imageFile = singleImageInput.files[0];

        if (!phoneNumber || !message) {
            alert('Nomor telepon dan pesan wajib diisi.');
            return;
        }

        const formData = new FormData();
        formData.append('phoneNumber', phoneNumber);
        formData.append('message', message);
        if (imageFile) {
            formData.append('image', imageFile);
        }

        singleSubmitBtn.disabled = true;
        singleSubmitBtn.classList.add('btn-loading');
        singleSubmitBtn.textContent = 'Mengirim Pesan...';

        try {
            const res = await fetch('/send-message', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Gagal mengirim pesan');
            }

            showResult(data.success || 'Pesan berhasil dikirim!', false);
            sendMessageForm.reset();
            clearSingleImageBtn.click(); // Reset preview
        } catch (err) {
            showResult('Error: ' + err.message, true);
        } finally {
            singleSubmitBtn.disabled = false;
            singleSubmitBtn.classList.remove('btn-loading');
            singleSubmitBtn.textContent = 'Kirim Pesan';
        }
    });

    // Handle Bulk Message (Excel) Form Submission
    sendBulkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearResult();

        if (!isConnected) {
            alert('WhatsApp belum terhubung. Pastikan scan QR code terlebih dahulu.');
            return;
        }

        if (!excelFileInput.files || excelFileInput.files.length === 0) {
            alert('Silakan pilih file Excel terlebih dahulu.');
            return;
        }

        const formData = new FormData();
        formData.append('excel', excelFileInput.files[0]);
        if (bulkImageInput.files.length > 0) {
            formData.append('image', bulkImageInput.files[0]);
        }

        bulkSubmitBtn.disabled = true;
        bulkSubmitBtn.classList.add('btn-loading');
        bulkSubmitBtn.textContent = 'Sedang Mengirim Pesan Massal...';

        try {
            const res = await fetch('/send-message', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Gagal memproses pengiriman massal');
            }

            let resultSummary = data.success;
            if (data.details && data.details.errors && data.details.errors.length > 0) {
                resultSummary += '\n\nCatatan Gagal:\n- ' + data.details.errors.slice(0, 10).join('\n- ');
                if (data.details.errors.length > 10) {
                    resultSummary += `\n... dan ${data.details.errors.length - 10} baris lainnya.`;
                }
            }

            showResult(resultSummary, false);
            sendBulkForm.reset();
            clearExcelBtn.click(); // Reset excel preview
            clearBulkImageBtn.click(); // Reset bulk image preview
        } catch (err) {
            showResult('Error: ' + err.message, true);
        } finally {
            bulkSubmitBtn.disabled = false;
            bulkSubmitBtn.classList.remove('btn-loading');
            bulkSubmitBtn.textContent = 'Kirim Pesan Massal';
        }
    });
});
