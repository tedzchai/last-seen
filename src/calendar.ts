import { google } from 'googleapis';
import { CFG } from './config';

export type RawEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
  visibility?: string;
};

function client() {
  const serviceAccountKey = CFG.GOOGLE_SERVICE_ACCOUNT_KEY ? JSON.parse(CFG.GOOGLE_SERVICE_ACCOUNT_KEY) : undefined;

  if (!serviceAccountKey) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is required');
  }

  const auth = new google.auth.JWT({
    email: serviceAccountKey.client_email,
    key: serviceAccountKey.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });

  return google.calendar({ version: 'v3', auth });
}

export async function listEvents(timeMinISO: string, timeMaxISO: string, maxResults=100): Promise<RawEvent[]> {
  const cal = client();
  const res = await cal.events.list({
    calendarId: CFG.CALENDAR_ID,
    singleEvents: true,
    orderBy: 'startTime',
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    maxResults
  });
  return (res.data.items ?? []) as RawEvent[];
}
