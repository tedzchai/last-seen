import 'dotenv/config';

const num = (s: string|undefined, d: number) => s ? Number(s) : d;

export const CFG = {
  TZ: process.env.TZ ?? 'America/Los_Angeles',
  CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID ?? 'primary',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET!,
  GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN!,

  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY!,

  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET!,
  AWS_S3_REGION: process.env.AWS_S3_REGION!,

  LOOKAHEAD_HOURS: num(process.env.LOOKAHEAD_HOURS, 36),
  LOOKBACK_HOURS: num(process.env.LOOKBACK_HOURS, 12),

  INCREMENTAL_ALLOW_LLM: (process.env.INCREMENTAL_ALLOW_LLM ?? 'false') === 'true',

  PUBLISH_DELAY_MINUTES: num(process.env.PUBLISH_DELAY_MINUTES, 60)
};
