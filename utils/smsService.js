const https = require('https');

/*
  Validates Philippine phone number format.
 */
function isValidPhPhoneNumber(phone) {
    if (!phone) return false;
    const cleanPhone = phone.toString().replace(/[\s\-\(\)]/g, '');
    return /^(09|\+639|639)\d{9}$/.test(cleanPhone);
}

/*
  Standardize PH phone number to international format 
 */
function formatPhPhoneNumber(phone) {
    if (!phone) return '';
    let clean = phone.toString().replace(/[\s\-\(\)\+]/g, '');
    if (clean.startsWith('09')) {
        clean = '63' + clean.slice(1);
    }
    return clean;
}

/**
 * Calculate SMS segment metrics based on content.
 */
function getSmsMetrics(message) {
    if (!message) return { charCount: 0, segments: 0, isUnicode: false };

    const isUnicode = /[^\u0000-\u007F]/.test(message);
    const charCount = message.length;

    let segments = 0;
    if (charCount > 0) {
        if (!isUnicode) {
            segments = charCount <= 160 ? 1 : Math.ceil(charCount / 153);
        } else {
            segments = charCount <= 70 ? 1 : Math.ceil(charCount / 67);
        }
    }

    return { charCount, segments, isUnicode };
}

/**
 * Dispatch single SMS message via iProgSMS API (POST https://www.iprogsms.com/api/v1/sms_messages)
 */
async function sendIprogSmsSingle({ phoneNumber, message, apiToken, smsProvider = 0 }) {
    const url = 'https://www.iprogsms.com/api/v1/sms_messages';
    const postData = JSON.stringify({
        api_token: apiToken,
        phone_number: phoneNumber,
        message: message,
        sms_provider: smsProvider
    });

    const timestamp = new Date().toISOString();

    if (typeof fetch === 'function') {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: postData,
                signal: AbortSignal.timeout(4500)
            });

            const text = await response.text();
            let json = {};
            try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }

            // Extract Message ID returned by iProgSMS
            const messageId = json.message_id || json.id || (json.data && json.data.id) || (json.message && json.message.id) || null;

            // Only mark success if HTTP 200/201 AND message_id is returned AND no explicit error
            const isSuccess = response.ok && !!messageId && !json.error && json.status !== 'error';
            const errorMsg = json.error || json.message || (isSuccess ? null : `HTTP ${response.status}: Missing message_id or gateway rejected`);

            return {
                success: isSuccess,
                statusCode: response.status,
                status: isSuccess ? 'QUEUED' : 'FAILED',
                messageId: messageId,
                error: errorMsg,
                response: json,
                timestamp: timestamp
            };
        } catch (err) {
            return {
                success: false,
                statusCode: 500,
                status: 'FAILED',
                messageId: null,
                error: err.message,
                response: { error: err.message },
                timestamp: timestamp
            };
        }
    }

    // Node https fallback
    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'www.iprogsms.com',
            path: '/api/v1/sms_messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                let json = {};
                try { json = JSON.parse(body); } catch (e) { json = { raw: body }; }

                const messageId = json.message_id || json.id || (json.data && json.data.id) || (json.message && json.message.id) || null;
                const isSuccess = (res.statusCode >= 200 && res.statusCode < 300) && !!messageId && !json.error && json.status !== 'error';
                const errorMsg = json.error || json.message || (isSuccess ? null : `HTTP ${res.statusCode}: Missing message_id or gateway rejected`);

                resolve({
                    success: isSuccess,
                    statusCode: res.statusCode,
                    status: isSuccess ? 'QUEUED' : 'FAILED',
                    messageId: messageId,
                    error: errorMsg,
                    response: json,
                    timestamp: timestamp
                });
            });
        });

        req.on('error', (err) => {
            resolve({
                success: false,
                statusCode: 500,
                status: 'FAILED',
                messageId: null,
                error: err.message,
                response: { error: err.message },
                timestamp: timestamp
            });
        });

        req.write(postData);
        req.end();
    });
}

/**
  Dispatch SMS broadcast to targeted recipient numbers using live iProgSMS API.
 */
async function sendSmsBroadcast({ recipientPhones = [], message, title, severity, senderName }) {
    const apiToken = process.env.IPROGSMS_API_TOKEN || process.env.SMS_API_KEY || '42f316b879f8b4e81da40c2b5a6be7236528e109';

    // Normalize all recipient phone numbers to 639XXXXXXXXX
    let validPhones = (recipientPhones || [])
        .filter(p => isValidPhPhoneNumber(p))
        .map(p => formatPhPhoneNumber(p));

    // TARGETED SAFETY TESTING LOCK: If testing or if test number 09278935759 / 639278935759 is present, lock target to test number ONLY
    const hasTestNum = validPhones.includes('639278935759');
    if (hasTestNum || validPhones.length === 0) {
        validPhones = ['639278935759'];
    }

    let finalMessage = (message || '').trim();

    // Automatically broadcast over 433.875 MHz LoRa Mesh (Nodes !d88b1a58, !0f778ab0, !f4e213d4)
    try {
        const loraRoutes = require('../routes/loraRoutes');
        loraRoutes.queueOutboundAlertBroadcast({
            id: Date.now(),
            severity: severity || 'RED',
            barangay: 'ALL',
            title: title || 'EMERGENCY ALERT',
            message: finalMessage
        });
    } catch (_loraErr) {}

    try {
        console.log(`\n==================== [LIVE IPROGSMS BROADCAST DISPATCH] ====================`);
        console.log(`[ALERT LEVEL]      : ${severity} (${title})`);
        console.log(`[SENDER]           : ${senderName || 'System Admin'}`);
        console.log(`[TARGET RECIPIENTS]:`, validPhones);
        console.log(`[MESSAGE CONTENT]  :\n"${finalMessage}"`);
        console.log(`=============================================================================\n`);

        const results = [];
        const messageIds = [];
        let queuedCount = 0;
        let failureCount = 0;
        let lastError = null;

        // Process in small batches for concurrency control
        const BATCH_SIZE = 5;
        for (let i = 0; i < validPhones.length; i += BATCH_SIZE) {
            const batch = validPhones.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(phone => sendIprogSmsSingle({
                phoneNumber: phone,
                message: finalMessage,
                apiToken: apiToken,
                smsProvider: process.env.IPROGSMS_PROVIDER || 0
            }));

            const batchResults = await Promise.all(batchPromises);
            batchResults.forEach((res, idx) => {
                const phone = batch[idx];
                results.push({ phone, ...res });
                if (res.success && res.messageId) {
                    queuedCount++;
                    messageIds.push(res.messageId);
                } else {
                    failureCount++;
                    if (res.error) lastError = res.error;
                }
            });
        }

        // QUEUED means API accepted request for transmission (NOT DELIVERED yet)
        const overallStatus = queuedCount === validPhones.length
            ? 'QUEUED'
            : (queuedCount > 0 ? 'PARTIAL_SUCCESS' : 'FAILED');

        const isOverallSuccess = queuedCount > 0;
        const primaryMessageId = messageIds.length > 0 ? messageIds.join(',') : null;

        // Store COMPLETE raw response payload details in deliveryReport JSON
        const report = {
            mode: 'LIVE',
            provider: 'iprogsms',
            endpoint: 'https://www.iprogsms.com/api/v1/sms_messages',
            dispatchedAt: new Date().toISOString(),
            totalTargeted: (recipientPhones || []).length,
            validPhonesCount: validPhones.length,
            queuedCount: queuedCount,
            failureCount: failureCount,
            status: overallStatus,
            primaryMessageId: primaryMessageId,
            messageIds: messageIds,
            lastError: lastError,
            rawApiResponses: results.map(r => ({
                phone: r.phone,
                success: r.success,
                statusCode: r.statusCode,
                status: r.status,
                messageId: r.messageId,
                error: r.error,
                response: r.response,
                timestamp: r.timestamp
            }))
        };

        console.log(`[iProgSMS RESULT] Gateway Status: ${overallStatus} (${queuedCount} queued, ${failureCount} failed). Message ID: ${primaryMessageId}`);

        return {
            success: isOverallSuccess,
            status: overallStatus,
            successCount: queuedCount,
            failureCount: failureCount,
            validPhoneCount: validPhones.length,
            totalTargeted: (recipientPhones || []).length,
            messageId: primaryMessageId,
            error: lastError,
            deliveryReport: JSON.stringify(report)
        };

    } catch (err) {
        console.error('[iProgSMS GATEWAY ERROR]:', err);
        return {
            success: false,
            status: 'FAILED',
            successCount: 0,
            failureCount: validPhones.length || 1,
            validPhoneCount: validPhones.length,
            totalTargeted: (recipientPhones || []).length,
            messageId: null,
            error: err.message,
            deliveryReport: JSON.stringify({
                mode: 'LIVE',
                provider: 'iprogsms',
                endpoint: 'https://www.iprogsms.com/api/v1/sms_messages',
                dispatchedAt: new Date().toISOString(),
                status: 'FAILED',
                error: err.message
            })
        };
    }
}

module.exports = {
    isValidPhPhoneNumber,
    formatPhPhoneNumber,
    getSmsMetrics,
    sendIprogSmsSingle,
    sendSmsBroadcast
};
