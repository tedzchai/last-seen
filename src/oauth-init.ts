import 'dotenv/config';
import { google } from 'googleapis';
import readline from 'node:readline';

(async () => {
  const o = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
  const url = o.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
  console.log('Open this URL and authorize:\n', url, '\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Enter the code here: ', async (code) => {
    rl.close();
    const { tokens } = await o.getToken(code.trim());
    console.log('\nSave this refresh token in .env as GOOGLE_REFRESH_TOKEN:\n', tokens.refresh_token);
  });
})();
