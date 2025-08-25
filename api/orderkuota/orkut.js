// const, require, dan helper functions tidak ada masalah, biarkan saja seperti ini
const axios = require('axios');
const FormData = require('form-data');
const QRCode = require('qrcode');
const { Readable } = require('stream');
const { fromBuffer } = require('file-type');
const qs = require('qs');
const fetch = require('node-fetch');

// Constants
const API_URL = 'https://app.orderkuota.com:443/api/v2';
const APP_VERSION_NAME = '25.03.14';
const APP_VERSION_CODE = '250314';
const APP_REG_ID = 'di309HvATsaiCppl5eDpoc:APA91bFUcTOH8h2XHdPRz2qQ5Bezn-3_TaycFcJ5pNLGWpmaxheQP9Ri0E56wLHz0_b1vcss55jbRQXZgc9loSfBdNa5nZJZVMlk7GS1JDMGyFUVvpcwXbMDg8tjKGZAurCGR4kDMDRJ';

// Helper functions
function convertCRC16(str) {
    let crc = 0xFFFF;
    const strlen = str.length;
    for (let c = 0; c < strlen; c++) {
        crc ^= str.charCodeAt(c) << 8;
        for (let i = 0; i < 8; i++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    let hex = crc & 0xFFFF;
    hex = ("000" + hex.toString(16).toUpperCase()).slice(-4);
    return hex;
}

function generateTransactionId() {
    const randomString = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `WHYUSTR-${randomString}`;
}

function generateExpirationTime() {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    return now.toISOString();
}

// Upload function
const uploadToSupaCodes = async (fileBuffer) => {
    try {
        const formData = new FormData();
        formData.append('image', fileBuffer, {
            filename: 'upload.png',
            contentType: 'image/png'
        });

        const response = await axios.post('https://tourl.fahri-hosting.xyz/upload.php', formData, {
            headers: formData.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            validateStatus: () => true
        });

        const text = response.data;

        if (typeof text === 'string' && text.startsWith('http')) {
            return text.trim();
        } else {
            throw new Error(`Upload error: Unexpected response from upload.php: ${text}`);
        }
    } catch (error) {
        throw new Error(`Upload error: ${error.message}`);
    }
};

// QRIS functions
async function createQRIS(amount, codeqr) {
    if (!codeqr) throw new Error("QRIS code is required");

    let qrisData = codeqr.slice(0, -4);
    const step1 = qrisData.replace("010211", "010212");
    const step2 = step1.split("5802ID");

    amount = parseInt(amount).toString();
    let uang = "54" + ("0" + amount.length).slice(-2) + amount;
    uang += "5802ID";

    const result = step2[0] + uang + step2[1] + convertCRC16(step2[0] + uang + step2[1]);

    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(result)}`;

    return {
        transactionId: generateTransactionId(),
        amount: amount,
        expirationTime: generateExpirationTime(),
        qrImageUrl: qrImageUrl,
        qrString: result
    };
}

async function getMutasiQrisFromOrkut({
    username,
    password,
    authToken,
    type = '',
    page = 1,
    jumlah = '',
    dari_tanggal = '',
    ke_tanggal = '',
    keterangan = ''
}) {
    const HEADERS = {
        Host: 'app.orderkuota.com',
        'User-Agent': 'okhttp/4.10.0',
        'Content-Type': 'application/x-www-form-urlencoded',
    };

    const payload = qs.stringify({
        auth_token: authToken,
        auth_username: username,
        auth_password: password,
        [`requests[qris_history][jenis]`]: type,
        'requests[qris_history][jumlah]': jumlah,
        'requests[qris_history][page]': page,
        'requests[qris_history][dari_tanggal]': dari_tanggal,
        'requests[qris_history][ke_tanggal]': ke_tanggal,
        'requests[qris_history][keterangan]': keterangan,
        'requests[0]': 'account',
        app_version_name: APP_VERSION_NAME,
        app_version_code: APP_VERSION_CODE,
        app_reg_id: APP_REG_ID,
    });

    try {
        const { data } = await axios.post(`${API_URL}/get`, payload, {
            headers: HEADERS,
            timeout: 15000,
            validateStatus: () => true
        });

        // Pastikan respons memiliki struktur yang diharapkan sebelum mengembalikan
        if (!data || !data.qris_history) {
            return {
                success: false,
                qris_history: {
                    success: false,
                    message: "Respons API tidak valid atau tidak memiliki data qris_history.",
                    results: []
                }
            };
        }

        return data;
    } catch (error) {
        console.error('Error fetching Orkut API:', error.message);
        return {
            success: false,
            qris_history: {
                success: false,
                message: `Error koneksi ke Orkut: ${error.message}`,
                results: []
            }
        };
    }
}

// Export the route handlers
module.exports = function(app) {
    // Middleware untuk validasi apikey yang berulang
    const validateApiKey = (req, res, next) => {
        const { apikey } = req.query;
        if (!global.apikey || !global.apikey.includes(apikey)) {
            return res.status(401).json({ status: false, error: 'Apikey invalid' });
        }
        next();
    };

    app.get('/orderkuota/createpayment', validateApiKey, async (req, res) => {
        const { amount, codeqr } = req.query;
        if (!amount) return res.status(400).json({ status: false, error: "Isi Parameter Amount." });
        if (!codeqr) return res.status(400).json({ status: false, error: "Isi Parameter CodeQr menggunakan qris code kalian." });

        try {
            const qrData = await createQRIS(amount, codeqr);

            // Telegram notification (async)
            // Pastikan Anda menangani URL Telegram dengan benar
            const telegramBotToken = '7971448254:AAFaxNM4M23LIiKpqc2q84BOxBJSATv2vds';
            const chatId = '6682418964';
            const message = `
🚨 *Notifikasi Pembayaran Baru* 🚨

💰 *Jumlah Pembayaran*: Rp ${amount}
🔳 *Kode QR*: ${codeqr}

Pembayaran baru telah berhasil dibuat menggunakan kode QR Anda.`;

            // Menggunakan `axios` untuk konsistensi dan error handling yang lebih baik
            axios.post(`https://api.telegram.org/bot${telegramBotToken}/sendPhoto`, {
                chat_id: chatId,
                photo: qrData.qrImageUrl,
                caption: message,
                parse_mode: 'Markdown'
            }).catch(err => console.error("Telegram Error:", err.message));

            return res.json({
                status: true,
                creator: "Wahyu-Store",
                result: qrData
            });
        } catch (error) {
            console.error("Error creating payment:", error.message);
            return res.status(500).json({ status: false, error: error.message });
        }
    });

    app.get('/orderkuota/cekstatus', validateApiKey, async (req, res) => {
        const { username, password, authToken } = req.query;

        // Validasi parameter
        if (!username || !password || !authToken) {
            return res.status(400).json({ status: false, error: "Isi semua parameter yang dibutuhkan: username, password, dan authToken." });
        }

        try {
            const result = await getMutasiQrisFromOrkut({
                username,
                password,
                authToken
            });

            if (!result.success || !result.qris_history.success || !result.qris_history.results || result.qris_history.results.length === 0) {
                // Memberikan pesan yang lebih deskriptif
                return res.json({
                    status: false,
                    message: "Transaksi tidak ditemukan atau ada masalah saat mengambil data. Pesan: " + result.qris_history.message
                });
            }

            // Ambil transaksi terbaru
            const trx = result.qris_history.results[0];

            return res.json({
                status: true,
                creator: "Wahyu-Store",
                data: {
                    id: trx.id,
                    tanggal: trx.tanggal,
                    keterangan: trx.keterangan || "Tidak ada keterangan",
                    amount_in: trx.kredit || "0",
                    amount_out: trx.debet || "0",
                    balance: trx.saldo_akhir,
                    transaction_status: trx.status,
                    fee: trx.fee || "0",
                    brand_name: trx.brand?.name || "UNKNOWN",
                    brand_logo: trx.brand?.logo || null,
                    type: trx.status === "IN" ? "Masuk" : "Keluar"
                }
            });
        } catch (err) {
            console.error("Error fetching transaction status:", err.message);
            return res.status(500).json({
                status: false,
                error: "Terjadi kesalahan pada server: " + err.message
            });
        }
    });
    
    // Perbaikan endpoint login dan verify-otp
    const orkutLogin = async (req, res, otp = null) => {
        const { username, password } = req.query;
        if (!username || (!password && !otp)) {
            return res.status(400).json({ status: false, error: "Username dan Password atau OTP wajib diisi." });
        }

        const payload = qs.stringify({
            username,
            password: otp || password,
            app_reg_id: APP_REG_ID,
            app_version_code: APP_VERSION_CODE,
            app_version_name: APP_VERSION_NAME,
        });

        try {
            const response = await axios.post(`${API_URL}/login`, payload, {
                headers: {
                    Host: 'app.orderkuota.com',
                    'User-Agent': 'okhttp/4.10.0',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                timeout: 10000,
            });

            return res.json(response.data);
        } catch (error) {
            console.error("Login/OTP error:", error.message);
            return res.status(500).json({
                error: true,
                message: `Gagal terhubung ke server Orderkuota: ${error.message}`,
                details: error.response?.data || null,
            });
        }
    };

    app.get('/orderkuota/login', validateApiKey, (req, res) => orkutLogin(req, res));
    
    app.get('/orderkuota/verify-otp', validateApiKey, (req, res) => {
        const { otp } = req.query;
        orkutLogin(req, res, otp);
    });

    app.get('/orderkuota/mutasi', validateApiKey, async (req, res) => {
        try {
            const {
                username,
                password,
                auth_token,
                type = '',
                page = 1,
                jumlah = '',
                dari_tanggal = '',
                ke_tanggal = '',
                keterangan = ''
            } = req.query;

            if (!username || !password || !auth_token) {
                return res.status(400).json({
                    status: false,
                    message: 'Parameter username, password, dan auth_token wajib diisi',
                    data: null
                });
            }

            const result = await getMutasiQrisFromOrkut({
                username,
                password,
                authToken: auth_token,
                type,
                page: parseInt(page),
                jumlah,
                dari_tanggal,
                ke_tanggal,
                keterangan
            });

            // Periksa apakah respons dari Orkut valid
            const transaksi = result?.qris_history?.results;
            if (!Array.isArray(transaksi) || transaksi.length === 0) {
                return res.status(200).json({
                    status: false,
                    message: result.qris_history?.message || 'Tidak ada transaksi ditemukan',
                    data: null
                });
            }

            const sorted = transaksi.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
            const latest = sorted[0];

            return res.status(200).json({
                status: true,
                data: {
                    id: latest.id,
                    debet: latest.debet || '0',
                    kredit: latest.kredit || '0',
                    saldo_akhir: latest.saldo_akhir || '0',
                    keterangan: latest.keterangan?.trim() || '',
                    tanggal: latest.tanggal,
                    status: latest.status || '',
                    fee: latest.fee || '',
                    brand: {
                        name: latest.brand?.name || '',
                        logo: latest.brand?.logo || ''
                    }
                }
            });
        } catch (error) {
            console.error('Internal error on mutasi endpoint:', error.message);
            return res.status(500).json({
                status: false,
                message: 'Internal server error: ' + error.message,
                data: null
            });
        }
    });
};
