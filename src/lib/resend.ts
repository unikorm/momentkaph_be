import https from 'https';

interface EmailPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
}

interface SendEmailResponse {
  id: string;
}

export function sendEmail(payload: EmailPayload): Promise<SendEmailResponse> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload); // actual HTML content

    const req = https.request( // Resend API docs: https://resend.com/docs/api-reference/emails/send-email
      {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const data = JSON.parse(Buffer.concat(chunks).toString()) as SendEmailResponse;
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`Resend ${res.statusCode}: ${JSON.stringify(data)}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
