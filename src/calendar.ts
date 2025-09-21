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
  const o = new google.auth.OAuth2(CFG.GOOGLE_CLIENT_ID, CFG.GOOGLE_CLIENT_SECRET);
  o.setCredentials({ refresh_token: CFG.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: 'v3', auth: o });
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
