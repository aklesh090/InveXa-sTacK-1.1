const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const { roleCheck } = require('../middleware/storeDb');
const nodemailer = require('nodemailer');

// ─── Helper: Send reorder confirmation email ────────────────────────────────
function createTransporter() {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        requireTLS: true,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        tls: { rejectUnauthorized: false }
    });
}

async function sendReorderEmail({ supplier, product, reorderQty, notes, storeName }) {
    const emailSubject = `Reorder Request – InveXa sTacK (${storeName || 'InveXa sTacK'})`;
    const emailBody = `
Dear ${supplier.name},

This is an automated confirmation from the InveXa sTacK Inventory System.

Our AI voice assistant has just called you regarding a reorder. 
Below are the full details of the request for your records:

──────────────────────────────────────
  Product:         ${product.name}
  Requested Qty:   ${reorderQty} units
  Current Stock:   ${product.currentStock} units
  Reorder Level:   ${product.minimumStock} units
  Batch Number:    ${product.batchNumber || 'N/A'}
──────────────────────────────────────

${notes ? `Additional Notes: ${notes}\n` : ''}

Please reply to this email or call us back to confirm the order and expected delivery time.

Regards,
${storeName || 'InveXa sTacK'} — Automated Inventory System
    `.trim();

    const transporter = createTransporter();
    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: supplier.email,
        subject: emailSubject,
        text: emailBody
    };
    if (process.env.MANAGER_EMAIL) mailOptions.cc = process.env.MANAGER_EMAIL;
    await transporter.sendMail(mailOptions);
    return emailBody;
}

// ─── Helper: Trigger Bland AI outbound call ─────────────────────────────────
function triggerBlandCall({ supplierPhone, supplierName, productName, reorderQty, webhookUrl }) {
    return new Promise((resolve, reject) => {
        const blandApiKey = process.env.BLAND_API_KEY || '';
        if (!blandApiKey || blandApiKey === 'your_bland_ai_api_key_here') {
            // DEMO MODE: simulate a successful call dispatch without a real API key
            console.log('[VoiceCall] DEMO MODE – no real Bland AI call made. Add BLAND_API_KEY to .env to enable live calls.');
            return resolve({ call_id: 'demo_' + Date.now(), status: 'demo_queued' });
        }

        const body = JSON.stringify({
            phone_number: supplierPhone,
            task: `You are the automated procurement assistant for InveXa sTacK inventory management system.
You are calling ${supplierName} to place a reorder request.

We need ${reorderQty} units of "${productName}".

Instructions:
1. Greet them politely and introduce yourself.
2. Ask if they can fulfill an order for ${reorderQty} units of "${productName}".
3. If they say YES for the full quantity — confirm the order and say: "An email has also been sent to you with the full order details. Please check your inbox for verification."
4. If they can only provide a PARTIAL amount — ask them how many units they DO have. Accept whatever partial amount they offer. Confirm the partial order and say: "An email has been sent with the order details. Please reply to confirm the partial quantity of [X] units."
5. If they CANNOT fulfill at all — thank them, apologize for the inconvenience, and say you will explore other suppliers.
6. Always be polite, professional, and concise. End the call with a friendly goodbye.`,
            extract_data: [
                {
                    name: 'fulfillment_status',
                    description: 'Did the supplier accept? Fully_Accepted = full qty, Partially_Accepted = partial qty, Denied = cannot fulfill',
                    type: 'string',
                    enum: ['Fully_Accepted', 'Partially_Accepted', 'Denied']
                },
                {
                    name: 'final_quantity',
                    description: `The number of units the supplier agreed to provide. If full order accepted this is ${reorderQty}. If partial, it is the number they confirmed.`,
                    type: 'number'
                },
                {
                    name: 'delivery_timeline',
                    description: 'When the supplier said they will deliver the goods, if mentioned.',
                    type: 'string'
                }
            ],
            voicemail_message: `Hello, this is the automated procurement assistant from InveXa sTacK. We are trying to reach you to reorder ${reorderQty} units of ${productName}. Please check your email inbox for the full order details and reply to confirm. Thank you!`,
            voicemail_action: 'leave_message',
            voice_id: '0',
            reduce_latency: true,
            webhook: webhookUrl
        });

        const options = {
            hostname: 'api.bland.ai',
            path: '/v1/calls',
            method: 'POST',
            headers: {
                'authorization': blandApiKey,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Invalid response from Bland AI: ' + data));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ─── POST /api/voice-call ───────────────────────────────────────────────────
// Triggers an AI voice call + sends email simultaneously
router.post('/', roleCheck('manager', 'admin', 'owner'), async (req, res) => {
    try {
        const Product = req.models.Product;
        const Supplier = req.models.Supplier;
        const ReorderLog = req.models.ReorderLog;
        const { productId, quantity, notes } = req.body;

        if (!productId) return res.status(400).json({ error: 'Product ID is required' });

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const supplier = await Supplier.findOne({ name: product.supplier });
        if (!supplier) return res.status(404).json({ error: `Supplier "${product.supplier}" not found in database.` });
        if (!supplier.phone) return res.status(400).json({ error: `Supplier "${supplier.name}" has no phone number. Please add one in Suppliers settings.` });

        const reorderQty = quantity || Math.max(product.maxStock - product.currentStock, product.minimumStock * 2);
        const storeName = req.user?.storeName || 'InveXa sTacK';

        // Build webhook URL (Bland AI calls this once the call ends)
        const publicUrl = (process.env.PUBLIC_URL || 'http://localhost:5000').replace(/\/$/, '');
        const webhookUrl = `${publicUrl}/api/voice-call/webhook`;

        // Create log entry BEFORE the call so we have an ID
        const reorderLog = new ReorderLog({
            productId: product._id,
            productName: product.name,
            supplierId: supplier._id,
            supplierName: supplier.name,
            supplierEmail: supplier.email,
            supplierPhone: supplier.phone,
            reorderQuantity: reorderQty,
            currentStock: product.currentStock,
            reorderLevel: product.minimumStock,
            emailStatus: 'pending',
            callStatus: 'queued',
            notes: notes || ''
        });
        await reorderLog.save();

        // ── Trigger BOTH actions in parallel ──────────────────────────────
        const [callResult, emailResult] = await Promise.allSettled([
            triggerBlandCall({
                supplierPhone: supplier.phone,
                supplierName: supplier.name,
                productName: product.name,
                reorderQty,
                webhookUrl
            }),
            sendReorderEmail({ supplier, product, reorderQty, notes, storeName })
        ]);

        // Process call result
        if (callResult.status === 'fulfilled') {
            const callData = callResult.value;
            reorderLog.callId = callData.call_id || '';
            reorderLog.callStatus = callData.call_id ? 'queued' : 'failed';
        } else {
            console.error('[VoiceCall] Call dispatch failed:', callResult.reason?.message);
            reorderLog.callStatus = 'failed';
        }

        // Process email result
        if (emailResult.status === 'fulfilled') {
            reorderLog.emailStatus = 'sent';
        } else {
            console.error('[VoiceCall] Email failed:', emailResult.reason?.message);
            reorderLog.emailStatus = 'failed';
            reorderLog.emailError = emailResult.reason?.message || 'Unknown error';
        }

        await reorderLog.save();

        const isDemo = reorderLog.callId && reorderLog.callId.startsWith('demo_');
        const callMessage = isDemo
            ? '🔊 DEMO MODE: Call simulated (add BLAND_API_KEY to .env for live calls)'
            : reorderLog.callStatus === 'queued'
                ? `📞 AI voice call dispatched to ${supplier.name} (${supplier.phone})`
                : `⚠️ Call dispatch failed — check BLAND_API_KEY in .env`;

        const emailMessage = reorderLog.emailStatus === 'sent'
            ? `📧 Confirmation email sent to ${supplier.email}`
            : `⚠️ Email failed: ${reorderLog.emailError || 'unknown error'}`;

        res.status(201).json({
            success: true,
            message: `${callMessage}\n${emailMessage}`,
            callStatus: reorderLog.callStatus,
            emailStatus: reorderLog.emailStatus,
            isDemo,
            reorderLog
        });

    } catch (err) {
        console.error('[VoiceCall] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/voice-webhook ────────────────────────────────────────────────
// Bland AI calls this URL when the call is finished with extracted data
// NOTE: This endpoint does NOT use storeDb middleware (Bland AI calls it directly)
router.post('/webhook', async (req, res) => {
    // Acknowledge Bland AI immediately (they require fast response)
    res.status(200).json({ received: true });

    try {
        const { call_id, extracted_data, transcript, status } = req.body;
        if (!call_id) return;

        console.log(`[VoiceWebhook] Call ${call_id} completed. Status: ${status}`);

        // Find the ReorderLog for this call across all databases
        // Since ReorderLog is per-store, we use the global parent connection
        const mongoose = require('mongoose');
        const ReorderLog = mongoose.model('ReorderLog');

        const log = await ReorderLog.findOne({ callId: call_id });
        if (!log) {
            console.log(`[VoiceWebhook] No ReorderLog found for call_id: ${call_id}`);
            return;
        }

        log.callStatus = 'completed';
        log.callTranscript = transcript || '';

        if (extracted_data) {
            const fs = (extracted_data.fulfillment_status || '').toLowerCase();
            if (fs.includes('fully')) {
                log.fulfillmentStatus = 'fully_accepted';
                log.finalQuantityAgreed = extracted_data.final_quantity || log.reorderQuantity;
                log.orderStatus = 'confirmed';
            } else if (fs.includes('partial')) {
                log.fulfillmentStatus = 'partially_accepted';
                log.finalQuantityAgreed = extracted_data.final_quantity || null;
                log.orderStatus = 'confirmed';
                // Add delivery note
                if (extracted_data.delivery_timeline) {
                    log.notes = (log.notes ? log.notes + ' | ' : '') + `Delivery: ${extracted_data.delivery_timeline}`;
                }
            } else if (fs.includes('denied')) {
                log.fulfillmentStatus = 'denied';
                log.finalQuantityAgreed = 0;
                log.orderStatus = 'cancelled';
            } else {
                log.fulfillmentStatus = 'unknown';
            }
        }

        await log.save();
        console.log(`[VoiceWebhook] ReorderLog updated. Fulfillment: ${log.fulfillmentStatus}, Final Qty: ${log.finalQuantityAgreed}`);

    } catch (err) {
        console.error('[VoiceWebhook] Error processing webhook:', err.message);
    }
});


// ─── Standalone webhook handler (exported for mounting without storeDb) ──────
async function handleWebhook(req, res) {
    res.status(200).json({ received: true });
    try {
        const { call_id, extracted_data, transcript, status } = req.body;
        if (!call_id) return;
        console.log(`[VoiceWebhook] Call ${call_id} completed. Status: ${status}`);
        const mongoose = require('mongoose');
        const ReorderLog = mongoose.model('ReorderLog');
        const log = await ReorderLog.findOne({ callId: call_id });
        if (!log) { console.log(`[VoiceWebhook] No log for call_id: ${call_id}`); return; }
        log.callStatus = 'completed';
        log.callTranscript = transcript || '';
        if (extracted_data) {
            const fs = (extracted_data.fulfillment_status || '').toLowerCase();
            if (fs.includes('fully')) {
                log.fulfillmentStatus = 'fully_accepted';
                log.finalQuantityAgreed = extracted_data.final_quantity || log.reorderQuantity;
                log.orderStatus = 'confirmed';
            } else if (fs.includes('partial')) {
                log.fulfillmentStatus = 'partially_accepted';
                log.finalQuantityAgreed = extracted_data.final_quantity || null;
                log.orderStatus = 'confirmed';
                if (extracted_data.delivery_timeline) {
                    log.notes = (log.notes ? log.notes + ' | ' : '') + `Delivery: ${extracted_data.delivery_timeline}`;
                }
            } else if (fs.includes('denied')) {
                log.fulfillmentStatus = 'denied';
                log.finalQuantityAgreed = 0;
                log.orderStatus = 'cancelled';
            } else {
                log.fulfillmentStatus = 'unknown';
            }
        }
        await log.save();
        console.log(`[VoiceWebhook] Updated → Fulfillment: ${log.fulfillmentStatus}, Final Qty: ${log.finalQuantityAgreed}`);
    } catch (err) {
        console.error('[VoiceWebhook] Error:', err.message);
    }
}

router.handleWebhook = handleWebhook;
module.exports = router;
