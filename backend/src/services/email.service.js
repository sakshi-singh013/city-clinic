const nodemailer = require("nodemailer");

let transporterPromise = null;

async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (process.env.SMTP_HOST) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined
      });
    }

    // No SMTP configured: spin up a free Ethereal test inbox so the whole
    // notification flow (booking confirmations, reminders, cancellations,
    // medication reminders) works out of the box with zero setup. Every
    // "sent" email gets a preview URL printed to the console.
    console.log("[email.service] No SMTP configured - creating a temporary Ethereal test inbox...");
    const testAccount = await nodemailer.createTestAccount();
    console.log(`[email.service] Ethereal inbox ready: ${testAccount.user}`);
    return nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
  })();

  return transporterPromise;
}

async function sendEmail({ to, subject, html }) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || '"City Clinic" <no-reply@cityclinic.example>',
    to,
    subject,
    html
  });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) console.log(`[email.service] Preview: ${previewUrl}`);
  return { messageId: info.messageId, previewUrl };
}

module.exports = { sendEmail };
