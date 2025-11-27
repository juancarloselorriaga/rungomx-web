import * as brevo from '@getbrevo/brevo';

const apiInstance = new brevo.TransactionalEmailsApi();

// Configure API key authorization
apiInstance.setApiKey(
  brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY || ''
);

interface SendEmailOptions {
  to: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export async function sendEmail({
  to,
  subject,
  htmlContent,
  textContent,
}: SendEmailOptions) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'RungoMX';

  if (!senderEmail) {
    throw new Error('BREVO_SENDER_EMAIL environment variable is not set');
  }

  if (!process.env.BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY environment variable is not set');
  }

  const sendSmtpEmail = new brevo.SendSmtpEmail();

  sendSmtpEmail.sender = { email: senderEmail, name: senderName };
  sendSmtpEmail.to = [{ email: to }];
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;

  if (textContent) {
    sendSmtpEmail.textContent = textContent;
  }

  try {
    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('Email sent successfully:', response);
    return response;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

export async function sendVerificationEmail({
  email,
  url,
  userName,
}: {
  email: string;
  url: string;
  userName: string;
}) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify your email</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">RungoMX</h1>
        </div>

        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">¡Hola ${userName}!</h2>

          <p style="font-size: 16px; margin-bottom: 20px;">
            Gracias por registrarte en RungoMX. Por favor verifica tu dirección de correo electrónico haciendo clic en el botón de abajo:
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${url}"
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      color: white;
                      padding: 14px 40px;
                      text-decoration: none;
                      border-radius: 5px;
                      display: inline-block;
                      font-weight: bold;
                      font-size: 16px;">
              Verificar Email
            </a>
          </div>

          <p style="font-size: 14px; color: #666; margin-top: 30px;">
            Si no creaste una cuenta en RungoMX, puedes ignorar este correo de manera segura.
          </p>

          <p style="font-size: 14px; color: #666;">
            Si el botón no funciona, copia y pega este enlace en tu navegador:
          </p>

          <p style="font-size: 12px; color: #999; word-break: break-all; background: #fff; padding: 10px; border-radius: 5px;">
            ${url}
          </p>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
          <p>© ${new Date().getFullYear()} RungoMX. Todos los derechos reservados.</p>
        </div>
      </body>
    </html>
  `;

  const textContent = `
Hola ${userName}!

Gracias por registrarte en RungoMX. Por favor verifica tu dirección de correo electrónico visitando el siguiente enlace:

${url}

Si no creaste una cuenta en RungoMX, puedes ignorar este correo de manera segura.

© ${new Date().getFullYear()} RungoMX. Todos los derechos reservados.
  `.trim();

  return sendEmail({
    to: email,
    subject: 'Verifica tu correo electrónico - RungoMX',
    htmlContent,
    textContent,
  });
}
